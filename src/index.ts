import OSSClient from './oss';
import AWSClient, { IAWSOptions } from './aws';
import { AbstractClient } from './client';
import { ICommonClientOptions } from './types';

export type IClientOptions =
  | ({ storageType: 'aws' } & IAWSOptions)
  | ({ storageType: 'oss' } & ICommonClientOptions);

export function build(options: IClientOptions): AbstractClient {
  const { storageType, ...extraOpts } = options;

  switch (storageType) {
    case 'oss':
      return new OSSClient(extraOpts);
    case 'aws':
      return new AWSClient(extraOpts);
    default:
      throw Error('invalid options!');
  }
}

export type Client = AbstractClient;
export * from './types';
export * from './aws';
