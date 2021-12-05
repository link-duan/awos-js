import {
  IAWOS,
  IGetObjectResponse,
  IListObjectOptions,
  ISignatureUrlOptions,
  IGetBufferedObjectResponse,
  IPutObjectOptions,
  IListObjectOutput,
  ICopyObjectOptions,
} from './types';
import OSS, { IOSSOptions } from './oss';
import AWS, { IAWSOptions } from './aws';

const assert = require('assert');

export interface IOptions {
  type: string;
  ossOptions?: IOSSOptions;
  awsOptions?: IAWSOptions;
}

export default class AWOS implements IAWOS {
  private client: IAWOS;

  constructor(options: IOptions) {
    assert(options.type, 'options.type is required!');

    if (options.type === 'oss' && options.ossOptions) {
      this.client = new OSS(options.ossOptions);
    } else if (options.type === 'aws' && options.awsOptions) {
      this.client = new AWS(options.awsOptions);
    } else {
      throw Error('invalid options!');
    }
  }

  public async get(
    key: string,
    metaKeys: string[] = []
  ): Promise<IGetObjectResponse | null> {
    return this.client.get(key, metaKeys);
  }

  public async getAsBuffer(
    key: string,
    metaKeys: string[] = []
  ): Promise<IGetBufferedObjectResponse | null> {
    return this.client.getAsBuffer(key, metaKeys);
  }

  public async put(
    key: string,
    data: string | Buffer,
    options?: IPutObjectOptions
  ): Promise<void> {
    return this.client.put(key, data, options);
  }

  public async copy(
    key: string,
    source: string,
    options?: ICopyObjectOptions
  ): Promise<void> {
    return this.client.copy(key, source, options);
  }

  public async del(key: string): Promise<void> {
    return this.client.del(key);
  }

  public async delMulti(keys: string[]): Promise<string[]> {
    if (keys.length > 1000) {
      throw new Error('Cannot delete more than 1000 keys');
    }
    return this.client.delMulti(keys);
  }

  public async head(key: string): Promise<Map<string, string> | null> {
    return this.client.head(key);
  }

  public async signatureUrl(
    key: string,
    _options?: ISignatureUrlOptions
  ): Promise<string | null> {
    return this.client.signatureUrl(key, _options);
  }

  public async listObject(
    key: string,
    options?: IListObjectOptions | undefined
  ): Promise<string[]> {
    return this.client.listObject(key, options);
  }

  public async listDetails(
    key: string,
    options?: IListObjectOptions
  ): Promise<IListObjectOutput> {
    return this.client.listDetails(key, options);
  }

  public async listObjectV2(
    key: string,
    options?: IListObjectOptions | undefined
  ): Promise<string[]> {
    return this.client.listObjectV2(key, options);
  }

  public async listDetailsV2(
    key: string,
    options?: IListObjectOptions
  ): Promise<IListObjectOutput> {
    return this.client.listDetailsV2(key, options);
  }
}
