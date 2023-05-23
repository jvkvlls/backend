import { BadRequestException, Injectable, InternalServerErrorException,Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm/dist/common';
import { DataSource, Repository } from 'typeorm';

import { CreateProductDto } from './dto/create-producto.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { paginationDto } from './dto/pagination.dto';

import {validate as isUUID} from 'uuid'
import { Product,ProductImage } from './entities';


@Injectable()
export class ProductsService {

  private readonly logger = new Logger('ProductsService');


  constructor(


    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,
  
    private readonly dataSource :DataSource,
 
  ){}
  
    async create(createProductDto: CreateProductDto) {
    try {
      const { images = [], ...productDetails} = createProductDto;

      const product= this.productRepository.create({
        ...productDetails,images:images.map(image => this.productImageRepository.create({url:image}))
      }) //crear un producto con sus propiedades

      await this.productRepository.save(product); //guarda el producto en bd

      return {...product, images};

    } catch (error) {
      this.handleDBExceptions(error);
    }
    }
  
    async findAll(pagination:paginationDto) {

      const {limit =10, offset = 0 }=pagination

     const product = await this.productRepository.find({
      take:limit,
      skip:offset,
      relations:{
        images:true,
      }
     });
     return product.map( product => ({
      ...product,
      images: product.images.map (img => img.url)
     }))
    }
  
    async findOne(term:string) {
      

      let product: Product;

      //inyeccion de dependencias (sql)x
      if(isUUID(term)){
      product = await this.productRepository.findOneBy({id:term});
      }else{
       const queryBuilder = this.productRepository.createQueryBuilder('prod');
       product = await queryBuilder
       .where('UPPER(title) =:title or slug =:slug',{
         title:term.toUpperCase(),
         slug: term.toLowerCase(),
       })
       .leftJoinAndSelect('prod.images','prodImages')
       .getOne();
      }


      //const product = await this.productRepository.findOneBy({id});
      if(!product) throw new NotFoundException (`Product whit id ${term} not found `);

      return product
    }
    //regresa las intacias del obcjet, regresa las imagenes(metodo)
    async findOnePlane(term:string){
      const { images = [],  ...rest} = await this.findOne(term) ;
      return{
        ...rest,
        images: images.map(images => images.url)
      }
    }
  
    async update(id: string, updateProductDto: UpdateProductDto) {


      const {images, ...toUpdate} = updateProductDto;

      const product = await this.productRepository.preload({id, ...toUpdate});
      if(!product) throw new NotFoundException(`product with id: ${id} not found`);

      //create query runner
       const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();



      try {
        if (images ){
           await queryRunner.manager.delete(ProductImage, {product:{id}})
           product.images = images.map( 
            image => this.productImageRepository.create({url:image}))
        }
        //await this.productRepository.save(product);
        await queryRunner.manager.save(product);

        await queryRunner.commitTransaction();
        await queryRunner.release();

      return this.findOnePlane( id );

      } catch (error) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        this.handleDBExceptions(error);
      }

    }

     async remove(id: string) {
      const product = await this.findOne(id);
      await this.productRepository.remove(product);
     }



     //ERROR CONTROLADO
      private handleDBExceptions(error:any){//todo tipo de error
       if(error.code == '23505' )
       throw new BadRequestException(error.detail);

       this.logger.error(error)
       //console.log (error)
       throw new InternalServerErrorException('Unexpected error, check server logs');
      }

      async deleteAllProducts(){
        const query= this.productRepository.createQueryBuilder('prduct');
        try {
          return await query.delete()
          .where({})
          .execute();
        } catch (error) {
         this.handleDBExceptions(error);
        }
      }
}

  
