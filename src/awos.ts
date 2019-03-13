import { IAWOS, IGetObjectResponse, IListObjectOptions } from './types';
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

  public async put(
    key: string,
    data: string,
    meta: Map<string, any> = new Map<string, any>()
  ): Promise<void> {
    return this.client.put(key, data, meta);
  }

  public async del(key: string): Promise<void> {
    return this.client.del(key);
  }

  public async head(key: string): Promise<Map<string, string> | null> {
    return this.client.head(key);
  }

  public async listObject(
    key: string,
    options?: IListObjectOptions | undefined
  ): Promise<string[]> {
    return this.client.listObject(key, options);
  }
}