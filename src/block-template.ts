import * as crypto from "crypto";
import * as util from '@vigcoin/cryptonote-util';

var instanceId = crypto.randomBytes(4);

export class BlockTemplate {
  blob: any;
  difficulty: number;
  height: number;
  reserveOffset: number;
  buffer: Buffer;
  extraNonce: number;
  constructor(template: any) {
    this.blob = template.blocktemplate_blob;
    this.difficulty = template.difficulty;
    this.height = template.height;
    this.reserveOffset = template.reserved_offset;
    this.buffer = new Buffer(this.blob, 'hex');
    instanceId.copy(this.buffer, this.reserveOffset + 4, 0, 3);
    this.extraNonce = 0;
  }

  nextBlob() {
    this.buffer.writeUInt32BE(++this.extraNonce, this.reserveOffset);
    return util.convert_blob(this.buffer).toString('hex');
  }
}
