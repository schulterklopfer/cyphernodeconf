const Ajv = require('ajv');
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

  constructor( data ) {
    const ajv = new Ajv({
      removeAdditional: true,
      useDefaults: true,
      coerceTypes: true
    });

    this.validators = {};

    for( let v in schemas ) {
      this.validators[v]=ajv.compile(schemas[v]);
    }

    this.data = data;

    this.validate();
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
