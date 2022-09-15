import { CarStatus } from '../../../contains';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as FormData from 'form-data';
import * as _ from 'lodash';
import { FindManyOptions, In, Repository } from 'typeorm';
import {
  CarAdminFilterDto,
  CarFilterDto,
  CreateCarDTO,
  UpdateCarDTO,
} from '../models/car.dto';
import { Car } from '../models/car.entity';
import {
  CreateCarAttributeDto,
  CreateCarAttributeTypeDto,
} from '../models/carAttribute.dto';
import { CarAttribute } from '../models/carAttribute.entity';
import { CarAttributeType } from '../models/carAttributeType.entity';
import mapFilesToArray from '../../../utils/mapFilesToArray';
import { BookedRecord } from '../../booking/models/bookedRecord.entity';

@Injectable()
export class CarService {
  @InjectRepository(Car)
  private readonly carRepository: Repository<Car>;

  @InjectRepository(BookedRecord)
  private readonly bookedRecordRepository: Repository<BookedRecord>;

  @InjectRepository(CarAttribute)
  private readonly carAttributeRepository: Repository<CarAttribute>;

  @InjectRepository(CarAttributeType)
  private readonly carAttributeTypeRepository: Repository<CarAttributeType>;

  public getCar(id: string): Promise<Car> {
    return this.carRepository.findOneBy({ id: id });
  }

  public async createCar(
    carDetail: Omit<CreateCarDTO, 'images'>,
    images: Buffer[],
  ): Promise<Car> {
    if (typeof carDetail.attributes == 'string')
      carDetail.attributes = [carDetail.attributes];

    const listAttributes = await this.getAttributesFromIds(
      carDetail.attributes,
    );

    const uploadResult = [];
    for (const image of images) {
      const result = await this.uploadImage(image);
      uploadResult.push(result.data?.display_url);
    }

    const car: Car = this.carRepository.create({
      ...carDetail,
      attributes: listAttributes,
      images: uploadResult,
    });

    await this.carRepository.save(car);

    return car;
  }

  public async getAllCar(
    filter: CarFilterDto = {
      locationId: '',
      page: 1,
      limit: 10,
      startDate: '',
      endDate: '',
    },
  ): Promise<Car[]> {
    if (typeof filter?.attribute == 'string') {
      filter.attribute = [filter.attribute];
    }
    const limit = filter.limit || 10;

    const queryForAttribute =
      filter.attribute?.length > 0 ? `car_attribute.id IN(:...ids)` : '1 = 1';

    const queryForHaving =
      filter.attribute?.length > 0 ? `count(*) = :countAttributes` : '1 = 1';

    const queryForRangeDate =
      filter.startDate && filter.endDate
        ? '((booked_record.id IS NOT NULL AND (NOT booked_record.bookTime && :date))'
        : '((1=1)';
    const bookingRange = `[${filter.startDate}, ${filter.endDate})`;

    const data = await this.carRepository
      .createQueryBuilder('car')
      .where('car.status = :status', { status: CarStatus.AVAILABLE })
      .leftJoin('car.attributes', 'car_attribute')
      .andWhere(queryForAttribute, { ids: filter.attribute })
      .having(queryForHaving, {
        countAttributes: filter.attribute?.length,
      })
      .groupBy('car.id')
      .take(limit)
      .skip(limit * ((filter.page || 1) - 1))
      .getMany();

    const availableCar = [];

    await Promise.all(
      data.map(async (item) => {
        if (filter.startDate && filter.endDate) {
          const isAvailable = await this.getCarAvailability(
            item.id,
            filter.startDate,
            filter.endDate,
          );
          if (isAvailable.isAvailable) {
            return availableCar.push(item);
          }
        } else {
          return availableCar.push(item);
        }
      }),
    );

    const result =
      availableCar.length > 0
        ? await this.carRepository
            .createQueryBuilder('car')
            .orderBy('car.createdAt', 'DESC')
            .where('car.id IN (:...ids)', {
              ids: availableCar.map((item) => item.id),
            })
            .leftJoinAndSelect('car.attributes', 'car_attribute')
            .leftJoinAndSelect('car_attribute.type', 'type')
            .leftJoinAndSelect('car.bookTime', 'booked_record')
            .getMany()
        : [];

    return result;
  }

  public async getCarAttributes(id: string) {
    const data = await this.carRepository
      .createQueryBuilder('car')
      .where('car.id = :id', { id })
      .leftJoinAndSelect('car.attributes', 'car_attribute')
      .leftJoinAndSelect('car_attribute.type', 'type')
      .getOne();

    if (!data) {
      throw new NotFoundException('Car not found');
    }

    return data.attributes.reduce((accum, attribute) => {
      accum[attribute.type.type] = attribute.value;
      return accum;
    }, {});
  }

  public async getCarAvailability(
    id: string,
    startDate: string,
    endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('Start date and end date are required');
    }
    const bookingRange = `[${startDate}, ${endDate})`;
    const availableCar = await this.carRepository
      .createQueryBuilder('car')
      .where('car.id = :id', { id })
      .innerJoinAndSelect('car.bookTime', 'booked_record')
      .getOne();
    if (!availableCar) return { isAvailable: true };
    const bookedRecord = await this.bookedRecordRepository
      .createQueryBuilder('booked_record')
      .where('booked_record.carId = :id', { id })
      .andWhere('booked_record.bookTime && :date', { date: bookingRange })
      .getOne();
    const isAvailable = bookedRecord ? false : true;
    return { isAvailable };
  }

  public async uploadImage(file: Buffer) {
    try {
      const form = new FormData();

      form.append('image', file, {
        filename: 'image.png',
      });

      const response = await axios.post(
        `https://api.imgbb.com/1/upload?key=${process.env.UPLOAD_API_KEY}`,
        form,
      );

      return response.data;
    } catch (err) {
      throw new BadGatewayException('Upload to imgbb failed');
    }
  }

  public async getAttributesFromIds(listId: string[]) {
    const listReducedDuplicateIds = _.uniq(listId);

    const result = await this.carAttributeRepository.find({
      where: {
        id: In(listReducedDuplicateIds),
      },
      relations: ['type'],
    });

    if (result.length != listReducedDuplicateIds.length)
      throw new BadRequestException('Attribute not found');

    return result;
  }

  public async createAttributeType(typeDetail: CreateCarAttributeTypeDto) {
    const attribute = await this.carAttributeTypeRepository.save(typeDetail);

    return attribute;
  }

  public async createAttribute(attributeDetail: CreateCarAttributeDto) {
    const { type, ...data } = attributeDetail;
    const typeData = await this.getAttributeType(type);

    const attribute = await this.carAttributeRepository.create({
      ...data,
    });

    attribute.type = typeData;

    const result = await this.carAttributeRepository.save(attribute);

    return result;
  }

  public async getAttribute() {
    const filter: FindManyOptions<CarAttribute> = {};

    const result = await this.carAttributeRepository
      .createQueryBuilder('attribute')
      .leftJoinAndSelect('attribute.type', 'type')
      .getMany();

    return result;
  }

  public async getAllAttributeType(): Promise<CarAttributeType[]> {
    const type = await this.carAttributeTypeRepository.find();

    return type;
  }

  public async getAttributeType(typeId: string): Promise<CarAttributeType> {
    const type = await this.carAttributeTypeRepository.findOne({
      where: { id: typeId },
    });

    if (!type) throw new NotFoundException('Type not found');

    return type;
  }

  public async getAllCarForAdmin(
    filter: CarAdminFilterDto,
  ): Promise<{ totalRecords: number; cars: Car[]; totalPage: number }> {
    const limit = filter.limit || 10;
    const page = filter.page || 1;

    const query = await this.carRepository.createQueryBuilder('car');

    const data = await query
      .take(limit)
      .skip(limit * (page - 1))
      .getMany();

    const records = await query.getCount();
    const numberOfPage = Math.floor(records / limit);
    const totalPage = numberOfPage ? numberOfPage : 1;

    const cars =
      data.length > 0
        ? await this.carRepository
            .createQueryBuilder('car')
            .orderBy('car.createdAt', 'DESC')
            .where('car.id IN (:...ids)', { ids: data.map((item) => item.id) })
            .leftJoinAndSelect('car.attributes', 'car_attribute')
            .leftJoinAndSelect('car_attribute.type', 'type')
            .getMany()
        : [];
    return { totalRecords: records, totalPage, cars };
  }

  public async updateCar(id: string, body: UpdateCarDTO) {
    const updateCar = await this.getCar(id);

    // Update attributes list
    if (typeof body.attributes == 'string') body.attributes = [body.attributes];
    if (typeof body.existedImages == 'string')
      body.existedImages = [body.existedImages];
    updateCar.attributes = await this.getAttributesFromIds(body.attributes);

    // Update images list
    const files = mapFilesToArray(body.images);
    const uploadResult = [];
    const images = files.map((item) => item.buffer);
    for (const image of images) {
      const result = await this.uploadImage(image);
      uploadResult.push(result.data?.display_url);
    }
    updateCar.images = [...body.existedImages, ...uploadResult];

    // Update other attributes
    for (const prop of Object.keys(body)) {
      if (
        prop !== 'images' &&
        prop !== 'existedImages' &&
        prop !== 'attributes'
      ) {
        updateCar[prop] = body[prop];
      }
    }

    await this.carRepository.save(updateCar);
    return updateCar;
  }
}
