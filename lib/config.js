const Ajv = require('ajv');
const fs = require('fs');
const Archive = require('./archive.js');

const latestConfigFileVersion='0.2.0';

const schemas = {
  '0.1.0': require('../schema/config-v0.1.0.json'),
  '0.2.0': require('../schema/config-v0.2.0.json'),
};

const migrateV0toV1 = (input) => {
  return input;
};

const mirgationPaths = {
  '0.1.0-v0.1.1': [ migrateV0toV1 ]
};


module.exports = class Config {

  constructor( options ) {
    options = options || {};

    const ajv = new Ajv({
      removeAdditional: true,
      useDefaults: true,
      coerceTypes: true
    });

    this.validators = {};

    for( let v in schemas ) {
      this.validators[v]=ajv.compile(schemas[v]);
    }

    this.data = { __version: latestConfigFileVersion };
    this.path = options.path;
    this.defaults = options.defaults || {};

    this.validate();
  }

  async serialize( password ) {
    this.resolveConfigConflicts()
    const configJsonString = JSON.stringify(this.data, null, 4);
    const archive = new Archive( this.path, password );
    return await archive.writeEntry( 'config.json', configJsonString );
  }

  async deserialize( password ) {

    if( fs.existsSync(this.path) ) {

      const archive = new Archive( this.path, password );

      const r = await archive.readEntry('config.json');

      if( r.error ) {
        console.log(chalk.bold.red('Password is wrong. Have a nice day.'));
        process.exit(1);
      }

      if( !r.value ) {
        console.log(chalk.bold.red('config archive is corrupt.'));
        process.exit(1);
      }

      this.data = JSON.parse(r.value);
      this.data.__version = this.data.__version || '0.1.0';

    }

    if( this.data.__version !== latestConfigFileVersion ) {
      // migrate here
      console.log( "Migrating" );
    }

    this.resolveConfigConflicts();
    this.assignConfigDefaults();

  }

  resolveConfigConflicts() {
    if( this.data.features && this.data.features.length && this.data.features.indexOf('lightning') !== -1 ) {
      this.data.bitcoin_prune = false;
      delete this.data.bitcoin_prune_size;
    }
  }

  assignConfigDefaults() {
    this.data = Object.assign( this.defaults, this.data );

  }

  validate() {

    if( !this.data.__version ||
        !this.validators[this.data.__version] ||
        Object.keys( schemas ).indexOf( this.data.__version ) == -1 ) {
      throw "Unknown version in data"
    }

    this.valid = this.validators[this.data.__version]( this.data );
    this.validateErrors = this.validators[this.data.__version].errors;

  }

  migrate(input, sourceVersion, targetVersion) {
    if( !mirgationPaths[sourceVersion+'-'+targetVersion] ) {
      return input;
    }

    const path = mirgationPaths[sourceVersion+'-'+targetVersion];

    let output=input;
    for( let m of path ) {
      output = m(output);
    }
    return output;
  }

};
