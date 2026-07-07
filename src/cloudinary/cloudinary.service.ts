import { Inject, Injectable } from '@nestjs/common';
import { UploadApiErrorResponse, UploadApiResponse, v2 } from 'cloudinary';
import toStream from 'buffer-to-stream';
import { CLOUDINARY } from './constants';
@Injectable()
export class CloudinaryService {
  constructor(@Inject(CLOUDINARY) private readonly cloudinary: typeof v2) {}

  async uploadImage(
    file: Express.Multer.File,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return new Promise((resolve, reject) => {
      const upload = this.cloudinary.uploader.upload_stream((error, result) => {
        if (error)
          return reject(new Error(error.message ?? 'Cloudinary upload failed'));
        if (!result)
          return reject(new Error('No result from Cloudinary upload'));
        resolve(result);
      });

      toStream(file.buffer).pipe(upload);
    });
  }
}
