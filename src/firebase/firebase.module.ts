import { Global, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';

function createFirebaseApp(configService: ConfigService) {
  const projectId = configService.get<string>('FIREBASE_PROJECT_ID');
  const clientEmail = configService.get<string>('FIREBASE_CLIENT_EMAIL');
  const privateKey = configService.get<string>('FIREBASE_PRIVATE_KEY');

  if (admin.apps.length > 0) {
    return admin.app();
  }

  if (clientEmail && privateKey) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }

  return admin.initializeApp({
    projectId,
  });
}

@Global()
@Module({
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createFirebaseApp(configService),
    },
  ],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
