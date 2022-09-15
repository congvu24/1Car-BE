import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiDefaultResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FormDataRequest } from 'nestjs-form-data';
import mapFilesToArray from '../../../utils/mapFilesToArray';
import {
  CarAdminDTO,
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
import { CarService } from '../services/car.service';
import { Public } from '../../../decorators/public.decorator';
import { AdminEndpoint } from '../../../decorators/admin.decorator';
import { ApiImplicitQuery } from '@nestjs/swagger/dist/decorators/api-implicit-query.decorator';
import { CarAttributeType } from '../models/carAttributeType.entity';

@Controller('car')
@ApiTags('car')
export class CarController {
  @Inject(CarService)
  private readonly service: CarService;

  @Public()
  @Get('/admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all car for admin' })
  @ApiImplicitQuery({
    name: 'page',
    description: 'Enter current page',
    required: false,
  })
  @ApiImplicitQuery({
    name: 'limit',
    description: 'Enter the max number of car you want to show on a page',
    required: false,
  })
  @ApiDefaultResponse({ type: CarAdminDTO })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  public getAllCarForAdmin(@Query() filter: CarAdminFilterDto): Promise<any> {
    return this.service.getAllCarForAdmin(filter);
  }

  @Public()
  @Get('/attribute/type')
  @ApiOperation({ summary: 'Get all attribute type' })
  @ApiDefaultResponse({ type: CarAttributeType, isArray: true })
  getAttributeType() {
    return this.service.getAllAttributeType();
  }

  @Public()
  @Get('/attribute')
  @ApiOperation({ summary: 'Get all attribute' })
  getAttribute() {
    return this.service.getAttribute();
  }

  @Post('/upload')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload file with file interceptor' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.service.uploadImage(file.buffer);
  }

  @Post('/attribute/type')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a attribute type' })
  @ApiCreatedResponse({ type: CarAttribute })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  createAttributeType(@Body() data: CreateCarAttributeTypeDto) {
    return this.service.createAttributeType(data);
  }

  @Post('/attribute')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a attribute' })
  @ApiBody({ type: CreateCarAttributeDto })
  @ApiCreatedResponse({ type: CarAttribute })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  createAttribute(@Body() data: CreateCarAttributeDto) {
    return this.service.createAttribute(data);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a car using form (Allow files upload)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateCarDTO })
  @FormDataRequest()
  @ApiCreatedResponse({ type: Car })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  public async createCar(@Body() body: CreateCarDTO): Promise<Car> {
    const { images, ...carDetail } = body;
    const files = mapFilesToArray(images);

    const createdCar = await this.service.createCar(
      carDetail,
      files.map((item) => item.buffer),
    );
    return createdCar;
  }

  @Public()
  @ApiOperation({ summary: 'Get car availability' })
  @Get(':id/available')
  @ApiDefaultResponse({ type: Boolean })
  public getCarAvailability(
    @Param('id') id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.service.getCarAvailability(id, startDate, endDate);
  }

  @Public()
  @ApiOperation({ summary: 'Get a car information given it id' })
  @Get(':id')
  @ApiDefaultResponse({ type: Car })
  public getCar(@Param('id') id: string): Promise<Car> {
    return this.service.getCar(id);
  }

  @Public()
  @ApiOperation({ summary: 'Get all attributes of a car' })
  @Get(':id/attributes')
  public getCarAttributes(@Param('id') id: string) {
    return this.service.getCarAttributes(id);
  }

  @Public()
  @ApiOperation({ summary: 'Get all car with filter using query' })
  @ApiImplicitQuery({
    name: 'locationId',
    description: 'Enter your location id (Google API)',
    required: false,
  })
  @ApiImplicitQuery({
    name: 'page',
    description: 'Enter current page',
    required: false,
  })
  @ApiImplicitQuery({
    name: 'limit',
    description: 'Enter max number of car on a page',
    required: false,
  })
  @ApiImplicitQuery({
    name: 'startDate',
    description: 'Enter start date of renting period',
    required: false,
  })
  @ApiImplicitQuery({
    name: 'endDate',
    description: 'Enter end date of renting period',
    required: false,
  })
  @ApiImplicitQuery({
    name: 'attribute',
    description: 'Enter a list of attribute ids',
    required: false,
  })
  @ApiDefaultResponse({ type: Car, isArray: true })
  @Get()
  public getAllCar(@Query() filter: CarFilterDto): Promise<Car[]> {
    return this.service.getAllCar(filter);
  }

  @Patch(':id')
  @Public()
  @FormDataRequest()
  @ApiOperation({ summary: 'Update a car' })
  public async updateCar(
    @Param() params: { id: string },
    @Body() body: UpdateCarDTO,
  ): Promise<Car> {
    return this.service.updateCar(params.id, body);
  }
}
