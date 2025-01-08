import {
  CopyObjectCommand,
  CopyObjectCommandInput,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  GetObjectCommandInput,
  HeadObjectCommand,
  ListObjectsCommand,
  ListObjectsCommandInput,
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  NoSuchKey,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as _ from 'lodash';
import { AbstractClient } from './client';
import {
  ICommonClientOptions,
  ICopyObjectOptions,
  IGetBufferedObjectResponse,
  IGetObjectResponse,
  IHeadOptions,
  IListObjectOptions,
  IListObjectOutput,
  IListObjectV2Options,
  IListObjectV2Output,
  IPutObjectOptions,
  ISignatureUrlOptions,
} from './types';

const assert = require('assert');
const retry = require('async-retry');

const STANDARD_HEADERS_KEYMAP = {
  ContentType: 'content-type',
  ContentLength: 'content-length',
  AcceptRanges: 'accept-ranges',
  ETag: 'etag',
  LastModified: 'last-modified',
};

export interface IAWSOptions extends ICommonClientOptions {
  s3ForcePathStyle?: boolean;
  region?: string;
  signatureVersion?: string;
}

export default class AWSClient extends AbstractClient {
  private client: S3Client;

  constructor(options: IAWSOptions) {
    super(options);

    const awsClientOptions: S3ClientConfig = {
      useAccelerateEndpoint: false,
      disableMultiregionAccessPoints: true,
      credentials: {
        accessKeyId: options.accessKeyID,
        secretAccessKey: options.accessKeySecret,
      },
    };
    const s3ForcePathStyle = !!options.s3ForcePathStyle;
    if (s3ForcePathStyle) {
      // minio
      assert(
        options.endpoint,
        'options.endpoint is required when options.s3ForcePathStyle = true'
      );
      awsClientOptions.endpoint = options.endpoint;
      awsClientOptions.region = options.region || 'cn-north-1';
      awsClientOptions.forcePathStyle = true;
    } else {
      // aws s3
      assert(
        options.region,
        'options.region is required when options.s3ForcePathStyle = false'
      );
      awsClientOptions.region = options.region;
      if (options.endpoint) {
        awsClientOptions.endpoint = options.endpoint;
      }
    }
    this.client = new S3Client(awsClientOptions);
  }

  protected async _get(
    key: string,
    metaKeys: string[]
  ): Promise<IGetObjectResponse | null> {
    const r = await this.getWithMetadata(key, metaKeys);
    if (!r || r.content === null) {
      return null;
    }
    const result: IGetObjectResponse = {
      ...r,
      content: r.content.toString(),
    };
    return result;
  }

  protected async _getAsBuffer(
    key: string,
    metaKeys: string[]
  ): Promise<IGetBufferedObjectResponse | null> {
    const r = await this.getWithMetadata(key, metaKeys);

    return r && r.content != null
      ? {
          ...r,
        }
      : null;
  }

  protected async _put(
    key: string,
    data: string | Buffer,
    options?: IPutObjectOptions
  ): Promise<void> {
    const bucket = this.getBucketName(key);

    const defaultOptions: IPutObjectOptions = {};
    const _options = options || defaultOptions;
    const defaultMeta: Map<string, any> = new Map<string, any>();
    const _meta = _options!.meta || defaultMeta;

    const metaData = {};
    for (const [k, v] of _meta) {
      metaData[k] = String(v);
    }

    const params: PutObjectCommandInput = {
      Body: data,
      Bucket: bucket,
      Key: key,
      Metadata: metaData,
      ContentType: _options.contentType || 'text/plain',
    };
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
    const _headers = _options.headers || {};
    if (_headers.cacheControl) {
      params.CacheControl = _headers.cacheControl;
    }
    if (_headers.contentDisposition) {
      params.ContentDisposition = _headers.contentDisposition;
    }
    if (this.compressType && data.length >= this.compressLimit) {
      params.Body = await this.compress(data);
      params.ContentEncoding = 'gzip';
    } else if (_headers.contentEncoding) {
      params.ContentEncoding = _headers.contentEncoding;
    }
    await this.client.send(new PutObjectCommand(params));
    // await retry(() => this.client.send(new PutObjectCommand(params)), {
    //   retries: 3,
    //   maxTimeout: 2000,
    // });
  }

  protected async _copy(
    key: string,
    source: string,
    options?: ICopyObjectOptions
  ): Promise<void> {
    const bucket = this.getBucketName(key);
    const sourceBucket = this.getBucketName(source);
    const defaultOptions: ICopyObjectOptions = {};
    const _options = options || defaultOptions;
    const defaultMeta: Map<string, any> = new Map<string, any>();
    const _meta = _options!.meta || defaultMeta;

    const metaData = {};
    for (const [k, v] of _meta) {
      metaData[k] = String(v);
    }

    const params: CopyObjectCommandInput = {
      CopySource: `${sourceBucket}/${source}`,
      Bucket: bucket,
      Key: key,
      Metadata: metaData,
      ContentType: _options.contentType || 'text/plain',
      MetadataDirective: _.isEmpty(metaData) ? 'COPY' : 'REPLACE',
    };

    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
    const _headers = _options.headers || {};
    if (_headers.cacheControl) {
      params.CacheControl = _headers.cacheControl;
    }
    if (_headers.contentDisposition) {
      params.ContentDisposition = _headers.contentDisposition;
    }
    if (_headers.contentEncoding) {
      params.ContentEncoding = _headers.contentEncoding;
    }

    await retry(async () => this.client.send(new CopyObjectCommand(params)), {
      retries: 3,
      maxTimeout: 2000,
    });
  }

  protected async _del(key: string): Promise<void> {
    const bucket = this.getBucketName(key);
    const params = {
      Bucket: bucket,
      Key: key,
    };
    await this.client.send(new DeleteObjectCommand(params));
  }

  /**
   * @param keys to be deleted
   * @returns deleted keys
   */
  protected async _delMulti(keys: string[]): Promise<string[]> {
    const bucket = this.getBucketName(keys[0]);
    const params = {
      Bucket: bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: true,
      },
    };
    const res = await this.client.send(new DeleteObjectsCommand(params));
    return res.Deleted?.filter((e) => !!e.Key).map((e) => e.Key!) || [];
  }

  protected async _head(
    key: string,
    options?: IHeadOptions
  ): Promise<Map<string, string> | null> {
    const bucket = this.getBucketName(key);
    const params = {
      Bucket: bucket,
      Key: key,
    };
    try {
      const data = await this.client.send(new HeadObjectCommand(params));
      const meta = new Map<string, string>();
      if (data.Metadata) {
        const metaData = data.Metadata;
        Object.keys(data.Metadata).forEach((k: string) => {
          meta.set(k, metaData[k]);
        });
      }
      if (options && options.withStandardHeaders) {
        for (const k of Object.keys(STANDARD_HEADERS_KEYMAP)) {
          if (STANDARD_HEADERS_KEYMAP[k] === 'last-modified') {
            meta.set(
              STANDARD_HEADERS_KEYMAP[k],
              String(new Date(data[k]).getTime())
            );
            continue;
          }
          meta.set(STANDARD_HEADERS_KEYMAP[k], String(data[k]));
        }
      }
      return meta;
    } catch (e) {
      if (e instanceof NoSuchKey) {
        return null;
      }
      throw e;
    }
  }

  protected async _listObject(
    key: string,
    options?: IListObjectOptions
  ): Promise<string[]> {
    const bucket = this.getBucketName(key);
    const paramsList: any = {
      Bucket: bucket,
    };

    if (options) {
      if (options.prefix) {
        paramsList.Prefix = options.prefix;
      }
      if (options.marker) {
        paramsList.Marker = options.marker;
      }
      if (options.maxKeys) {
        paramsList.MaxKeys = options.maxKeys;
      }
    }

    return this.client
      .send(new ListObjectsCommand(paramsList))
      .then((r) => r.Contents?.map((v) => v.Key!) || []);
  }

  protected async _listObjectV2(
    key: string,
    options?: IListObjectV2Options
  ): Promise<string[]> {
    const bucket = this.getBucketName(key);
    const paramsList: ListObjectsV2CommandInput = {
      Bucket: bucket,
    };

    if (options) {
      if (options.prefix) {
        paramsList.Prefix = options.prefix;
      }
      if (options.continuationToken) {
        paramsList.ContinuationToken = options.continuationToken;
      }
      if (options.maxKeys) {
        paramsList.MaxKeys = options.maxKeys;
      }
    }

    return this.client
      .send(new ListObjectsV2Command(paramsList))
      .then((r) => r.Contents?.map((v) => v.Key!) || []);
  }

  protected async _listDetails(
    key: string,
    options?: IListObjectOptions
  ): Promise<IListObjectOutput> {
    const bucket = this.getBucketName(key);
    const paramsList: ListObjectsCommandInput = {
      Bucket: bucket,
    };

    if (options) {
      if (options.prefix) {
        paramsList.Prefix = options.prefix;
      }
      if (options.delimiter) {
        paramsList.Delimiter = options.delimiter;
      }
      if (options.marker) {
        paramsList.Marker = options.marker;
      }
      if (options.maxKeys) {
        paramsList.MaxKeys = options.maxKeys;
      }
    }
    return this.client.send(new ListObjectsCommand(paramsList)).then((data) => {
      return {
        isTruncated: data.IsTruncated || false,
        objects: data.Contents
          ? data.Contents.map((o) => ({
              key: o.Key,
              etag: o.ETag,
              lastModified: o.LastModified,
              size: o.Size,
            }))
          : [],
        prefixes: data.CommonPrefixes
          ? data.CommonPrefixes.map((p) => p.Prefix!).filter((p) => p != null)
          : [],
        nextMarker: data.NextMarker,
      };
    });
  }

  protected async _listDetailsV2(
    key: string,
    options?: IListObjectV2Options
  ): Promise<IListObjectV2Output> {
    const bucket = this.getBucketName(key);
    const paramsList: ListObjectsV2CommandInput = {
      Bucket: bucket,
    };

    if (options) {
      if (options.prefix) {
        paramsList.Prefix = options.prefix;
      }
      if (options.delimiter) {
        paramsList.Delimiter = options.delimiter;
      }
      if (options.continuationToken) {
        paramsList.ContinuationToken = options.continuationToken;
      }
      if (options.maxKeys) {
        paramsList.MaxKeys = options.maxKeys;
      }
    }

    return this.client
      .send(new ListObjectsV2Command(paramsList))
      .then((data) => {
        return {
          isTruncated: data.IsTruncated || false,
          objects: data.Contents
            ? data.Contents.map((o) => ({
                key: o.Key,
                etag: o.ETag,
                lastModified: o.LastModified,
                size: o.Size,
              }))
            : [],
          prefix: data.CommonPrefixes
            ? data.CommonPrefixes.map((p) => p.Prefix!).filter((p) => p != null)
            : [],
          nextContinuationToken: data.NextContinuationToken,
        };
      });
  }

  protected async _signatureUrl(
    key: string,
    _options?: ISignatureUrlOptions
  ): Promise<string | null> {
    const bucket = this.getBucketName(key);
    const params: any = {
      Bucket: bucket,
      Key: key,
    };

    let expiresIn = 600;
    let cmd = new GetObjectCommand(params);
    if (_options) {
      if (_options.expires) {
        expiresIn = _options.expires;
      }
      if (_options.method === 'PUT') {
        cmd = new PutObjectCommand(params);
      }
    }

    return await getSignedUrl(this.client, cmd, { expiresIn });
  }

  private async getWithMetadata(
    key: string,
    metaKeys: string[]
  ): Promise<{
    content: Buffer;
    meta: Map<string, string>;
    headers: any;
  } | null> {
    const bucket = this.getBucketName(key);
    const params: GetObjectCommandInput = {
      Bucket: bucket,
      Key: key,
    };
    try {
      const awsResult = await this.client.send(new GetObjectCommand(params));
      const meta = new Map<string, string>();
      metaKeys.forEach((k: string) => {
        if (awsResult.Metadata && awsResult.Metadata[k]) {
          meta.set(k, awsResult.Metadata[k]);
        }
      });
      const headers = {
        'content-type': awsResult.ContentType,
        etag: awsResult.ETag,
        'content-length': awsResult.ContentLength,
      };

      const content = await awsResult.Body!.transformToByteArray();
      const body: Buffer = Buffer.from(content);
      const result = {
        content: body,
        meta,
        headers,
      };
      if (awsResult.ContentEncoding?.startsWith('gzip')) {
        result.content = await this.decompress(body);
      }
      return result;
    } catch (err) {
      if (err instanceof NoSuchKey) {
        return null;
      }
      throw err;
    }
  }
}
