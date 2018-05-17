export class RingBuffer {
  data: any = [];
  cursor = 0;
  isFull = false;
  maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  public append(x: any) {
    if (this.isFull) {
      this.data[this.cursor] = x;
      this.cursor = (this.cursor + 1) % this.maxSize;
    } else {
      this.data.push(x);
      this.cursor++;
      if (this.data.length === this.maxSize) {
        this.cursor = 0;
        this.isFull = true;
      }
    }
  }

  public avg(plusOne: number) {
    var sum = this.data.reduce(function(a: any, b: any) {
      return a + b;
    }, plusOne || 0);
    return (
      sum / ((this.isFull ? this.maxSize : this.cursor) + (plusOne ? 1 : 0))
    );
  }
  public size() {
    return this.isFull ? this.maxSize : this.cursor;
  }
  public clear() {
    this.data = [];
    this.cursor = 0;
    this.isFull = false;
  }
}
