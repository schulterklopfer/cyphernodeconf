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

  constructor() {

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

    this.validate();
  }

  async serialize( path, password ) {
    this.resolveConfigConflicts();
    this.validate();
    const configJsonString = JSON.stringify(this.data, null, 4);
    const archive = new Archive( path, password );
    return await archive.writeEntry( 'config.json', configJsonString );
  }

  async deserialize( path, password ) {

    if( fs.existsSync(path) ) {

      const archive = new Archive( path, password );

      const r = await archive.readEntry('config.json');

      if( r.error ) {
        throw( 'Password is wrong. Have a nice day.' );
      }

      if( !r.value ) {
        throw('config archive is corrupt.');
      }

      this.data = JSON.parse(r.value);
      this.data.__version = this.data.__version || '0.1.0';

    }

    if( this.data.__version !== latestConfigFileVersion ) {
      // migrate here
      console.log( "Migrating" );
    }

    //this.resolveConfigConflicts();
    this.validate();

  }

  resolveConfigConflicts() {
    // TODO solve this in config schema
    if( this.data.features && this.data.features.length && this.data.features.indexOf('lightning') !== -1 ) {
      this.data.bitcoin_prune = false;
      delete this.data.bitcoin_prune_size;
    }
  }

  validate() {

    if( !this.data.__version ||
        !this.validators[this.data.__version] ||
        Object.keys( schemas ).indexOf( this.data.__version ) == -1 ) {
      throw "Unknown version in data"
    }

    // this will assign default values from the schema
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
