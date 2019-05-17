const fs = require('fs');
const path = require('path');
const ansi = require( './ansi.js' );

const easeOutCubic = (t, b, c, d) => {
  return c*((t=t/d-1)*t*t+1)+b;
};

module.exports = class SplashScreen {

  constructor( options ) {
    options = options || {};

    if( !options.frameDir ) {
      throw "no frame directory to load"
    }

    this.loadFramesFromDir( options.frameDir );
  }

  loadFramesFromDir( frameDir ) {
    this.frames = [];
    fs.readdirSync(frameDir).forEach((file) => {
      this.frames.push(fs.readFileSync(path.join(__dirname,'..','splash',file)));
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  async show() {

    const frame0 = this.frames[0];

    const frame0lines = frame0.toString().split('\n');
    const frame0lineCount = frame0lines.length;
    const steps = 10;

    await this.sleep(250);

    process.stdout.write(ansi.clear);

    await this.sleep(150);

    for( let i=0; i<=steps; i++ ) {
      const pos = easeOutCubic( i, 0, frame0lineCount, steps ) | 0;
      process.stdout.write(ansi.reset);
      for( let l=frame0lineCount-pos; l<frame0lineCount; l++ ) {
        process.stdout.write( frame0lines[l]+'\n' );
      }
      await this.sleep(33);
    }

    await this.sleep(400);

    for( let frame of this.frames ) {
      process.stdout.write(ansi.reset);
      process.stdout.write(frame.toString());
      await this.sleep(33);
    }
    await this.sleep(400);
    process.stdout.write('\n');
  }

};