import { Injectable } from '@nestjs/common';
import { UploadApiErrorResponse, UploadApiResponse, v2 } from 'cloudinary';
import toStream from 'buffer-to-stream';
@Injectable()
export class CloudinaryService {
  async uploadImage(
    file: Express.Multer.File,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return new Promise((resolve, reject) => {
      const upload = v2.uploader.upload_stream((error, result) => {
        if (error)
          return reject(new Error(error.message ?? 'Cloudinary upload failed'));
        if (!result)
          return reject(new Error('No result from Cloudinary upload'));
        resolve(result);
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      toStream(file.buffer).pipe(upload);
    });
  }
}
