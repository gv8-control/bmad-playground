import { type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Daytona } from '@daytonaio/sdk';

export const DAYTONA_CLIENT = Symbol('DAYTONA_CLIENT');

export const daytonaClientProvider: Provider = {
  provide: DAYTONA_CLIENT,
  useFactory: (configService: ConfigService) => {
    const apiUrl = configService.get<string>('daytonaApiUrl');
    const apiKey = configService.get<string>('daytonaApiKey');

    return new Daytona({ apiKey, apiUrl });
  },
  inject: [ConfigService],
};
