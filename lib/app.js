const {promisify} = require('util');

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const wrap = require('wrap-ansi');
const validator = require('validator');
const coinstring = require('coinstring');
const inquirer = require('inquirer');
const ejs = require( 'ejs' );
const ejsRenderFileAsync = promisify( ejs.renderFile ).bind( ejs );

const html2ansi = require('./html2ansi.js');
const name = require('./name.js');
const Archive = require('./archive.js');
const ApiKey = require('./apikey.js');
const Cert = require('./cert.js');
const htpasswd = require( './htpasswd.js');
const Config = require('./config.js');
const SplashScreen = require( './splashScreen.js' );
const ansi = require( './ansi.js' );

const features = require('../features.json');

const uaCommentRegexp = /^[a-zA-Z0-9 \.,:_\-\?\/@]+$/; // TODO: look for spec of unsafe chars
const userRegexp = /^[a-zA-Z0-9\._\-]+$/;

const keyIds = {
  '000': ['stats'],
  '001': ['stats','watcher'],
  '002': ['stats','watcher','spender'],
  '003': ['stats','watcher','spender','admin']
};

const configFileVersion='0.2.0';

const prefix = () => {
  return chalk.green('Cyphernode')+': ';
};

let prompters = [];
fs.readdirSync(path.join(__dirname, '..','prompters')).forEach((file) => {
  prompters.push(require(path.join(__dirname, '..','prompters',file)));
});

module.exports = class App {

  constructor() {
    this.features = features;

    if( fs.existsSync(path.join('/data', 'exitStatus.sh')) ) {
      fs.unlinkSync(path.join('/data', 'exitStatus.sh'));
    }

    this.splash = new SplashScreen( { frameDir: path.join(__dirname, '..', 'splash' ) } );

  }

  async start( options ) {

    options = options || {};

    this.noWizard = !!options.noWizard;
    this.noSplashScreen = !!options.noSplashScreen;


    await this.setupConfigArchive();

    if( !this.noSplashScreen ) {
      await this.splash.show();
    }

    if( !this.noWizard ) {
      // save gatekeeper key password to check if it changed
      this.gatekeeper_clientkeyspassword = this.props.gatekeeper_clientkeyspassword;
      await this.startWizard();
    }

    await this.processProps();
    await this.writeFiles();
  }

  async setupConfigArchive() {
    this.defaultDataDirBase = process.env.DEFAULT_DATADIR_BASE ||  process.env.HOME, 'cyphernode';
    this.setupDir = process.env.SETUP_DIR || path.join( process.env.HOME, 'cyphernode' );
    const versionOverride = process.env.VERSION_OVERRIDE==='true';
    if( fs.existsSync(this.destinationPath('config.7z')) ) {
      let r = {};

      if( process.env.CFG_PASSWORD ) {
        this.configurationPassword = process.env.CFG_PASSWORD;
      } else {
        process.stdout.write(ansi.reset);
        while( !r.password ) {
          r = await this.prompt([{
            type: 'password',
            name: 'password',
            message: prefix()+chalk.bold.blue('Enter your configuration password?'),
            filter: this.trimFilter
          }]);
        }
        this.configurationPassword = r.password;
      }

      const archive = new Archive( this.destinationPath('config.7z'), this.configurationPassword );

      r = await archive.readEntry('config.json');

      if( r.error ) {
        console.log(chalk.bold.red('Password is wrong. Have a nice day.'));
        process.exit(1);
      }

      if( !r.value ) {
        console.log(chalk.bold.red('config archive is corrupt.'));
        process.exit(1);
      }

      try {
        this.props = JSON.parse(r.value);
        this.props.__version = this.props.__version || '0.1.0';
        this.config = new Config(this.props); // this modifies this.props
      } catch( err ) {
        console.log(chalk.bold.red('config archive is corrupt.'));
        process.exit(1);
      }

    } else {
      let r = {};
      process.stdout.write(ansi.clear+ansi.reset);
      while( !r.password0 || !r.password1 || r.password0 !== r.password1 ) {

        if( r.password0 && r.password1 && r.password0 !== r.password1 ) {
          console.log(chalk.bold.red('Passwords do not match')+'\n');
        }

        r = await this.prompt([{
          type: 'password',
          name: 'password0',
          message: prefix()+chalk.bold.blue('Choose your configuration password'),
          filter: this.trimFilter
        },
          {
            type: 'password',
            name: 'password1',
            message: prefix()+chalk.bold.blue('Confirm your configuration password'),
            filter: this.trimFilter
          }]);
      }

      this.configurationPassword = r.password0;
      this.props = {
        __version: configFileVersion
      };

    }

    if( this.props.__version !== configFileVersion ) {
      // migrate here
      console.log( "Migrating" );
    }

    this.props.initial_admin_password = await htpasswd(this.configurationPassword);

    if( versionOverride ) {
      delete this.props.gatekeeper_version;
      delete this.props.proxy_version;
      delete this.props.proxycron_version;
      delete this.props.pycoin_version;
      delete this.props.otsclient_version;
      delete this.props.bitcoin_version;
      delete this.props.lightning_version;
      delete this.props.sparkwallet_version;
      delete this.props.grafana_version;
    }

    this.resolveConfigConflicts();
    this.assignConfigDefaults();

    for( let c of this.features ) {
      c.checked = this.isChecked( 'features', c.value );
    }

  }

  async startWizard() {
    let r = await this.prompt([{
      type: 'confirm',
      name: 'enablehelp',
      message: prefix()+'Enable help?',
      default: this.getDefault( 'enablehelp' ),
    }]);

    this.props.enablehelp = r.enablehelp;

    if( this.props.enablehelp ) {
      this.help = require('../help.json');
    }

    let prompts = [];
    for( let m of prompters ) {
      prompts = prompts.concat(m.prompts(this));
    }

    const props = await this.prompt(prompts);

    this.props = Object.assign(this.props, props);
  }

  async processProps() {

    // creates keys if they don't exist or we say so.
    if( this.props.gatekeeper_recreatekeys ||
      this.props.gatekeeper_keys.configEntries.length===0 ) {

      delete this.props.gatekeeper_recreatekeys;

      let configEntries = [];
      let clientInformation = [];

      for( let keyId in keyIds ) {
        const apikey = await this.createRandomKey( keyId, keyIds[keyId] );
        configEntries.push(apikey.getConfigEntry());
        clientInformation.push(apikey.getClientInformation());
      }

      this.props.gatekeeper_keys = {
        configEntries: configEntries,
        clientInformation: clientInformation
      }

    }

    const cert = new Cert();
    this.props.cns = cert.cns(this.props.gatekeeper_cns);

    // create certs if they don't exist or we say so.
    if( this.props.gatekeeper_recreatecert ||
      !this.props.gatekeeper_sslcert ||
      !this.props.gatekeeper_sslkey ) {
      delete this.props.gatekeeper_recreatecert;
      const cert = new Cert();
      console.log(chalk.bold.green( '☕ Generating gatekeeper cert. This may take a while ☕' ));
      try {
        const result = await cert.create(this.props.cns);
        if( result.code === 0 ) {
          this.props.gatekeeper_sslkey = result.key.toString();
          this.props.gatekeeper_sslcert = result.cert.toString();
        } else {
          console.log(chalk.bold.red( 'error! Gatekeeper cert was not created' ));
        }
      } catch( err ) {
        console.log(chalk.bold.red( 'error! Gatekeeper cert was not created' ));
      }
    }
  }

  async createRandomKey( id, groups ) {
    if( !id || !groups || !groups.length ) {
      return;
    }
    const apikey = new ApiKey();
    apikey.setId(id);
    apikey.setGroups(groups);
    await apikey.randomiseKey();
    return apikey
  }

  async writeFiles() {
    this.resolveConfigConflicts()

    const configJsonString = JSON.stringify(this.props, null, 4);
    const archive = new Archive( this.destinationPath('config.7z'), this.configurationPassword );

    if( !await archive.writeEntry( 'config.json', configJsonString ) ) {
      console.log(chalk.bold.red( 'error! Config archive was not written' ));
    }

    console.log( chalk.green( 'Creating:' )+' config.7z' );

    const pathProps = [
      'gatekeeper_datapath',
      'traefik_datapath',
      'proxy_datapath',
      'bitcoin_datapath',
      'lightning_datapath',
      'otsclient_datapath'
    ];

    for( let pathProp of pathProps ) {
      if( this.props[pathProp] === '_custom' ) {
        this.props[pathProp] = this.props[pathProp+'_custom'] || '';
      }
    }

    for( let m of prompters ) {
      const name = m.name();
      for( let t of m.templates(this.props) ) {
        const p = path.join(name,t);
        const destFile = this.destinationPath(p);
        const targetDir = path.dirname( destFile );

        if( !fs.existsSync(targetDir) ) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const result = await ejsRenderFileAsync( this.templatePath(p), this.props, {} );

        console.log( chalk.green( 'Creating:' )+' '+p );
        fs.writeFileSync( destFile, result );

      }
    }

    console.log( chalk.green( 'Creating:' )+' client.7z' );

    if( this.props.gatekeeper_keys && this.props.gatekeeper_keys.clientInformation ) {

      if( this.gatekeeper_clientkeyspassword !== this.props.gatekeeper_clientkeyspassword &&
          fs.existsSync(this.destinationPath('client.7z')) ) {
        fs.unlinkSync( this.destinationPath('client.7z') );
      }

      const archive = new Archive( this.destinationPath('client.7z'), this.props.gatekeeper_clientkeyspassword );
      if( !await archive.writeEntry( 'keys.txt', this.props.gatekeeper_keys.clientInformation.join('\n') ) ) {
        console.log(chalk.bold.red( 'error! Client gatekeeper key archive was not written' ));
      }
      if( !await archive.writeEntry( 'cacert.pem', this.props.gatekeeper_sslcert ) ) {
        console.log(chalk.bold.red( 'error! Client gatekeeper key archive was not written' ));
      }
    }

    fs.writeFileSync(path.join('/data', 'exitStatus.sh'), 'EXIT_STATUS=0');
    
  }

  async prompt( questions ) {
    if( !questions ) {
      return {};
    }

    const r = await inquirer.prompt( questions );
    return r;
  }

  /* some utils */

  destinationPath( relPath ) {
    return path.join( '/data', relPath );
  }

  templatePath( relPath ) {
    return path.join(__dirname, '..','templates',relPath );
  }

  resolveConfigConflicts() {
    if( this.props.features && this.props.features.length && this.props.features.indexOf('lightning') !== -1 ) {
      this.props.bitcoin_prune = false;
      delete this.props.bitcoin_prune_size;
    }
  }

  assignConfigDefaults() {
    this.props = Object.assign( {
      features: [],
      enablehelp: true,
      net: 'testnet',
      xpub: '',
      derivation_path: '0/n',
      installer_mode: 'docker',
      devmode: false,
      devregistry: false,
      run_as_different_user: true,
      username: 'cyphernode',
      docker_mode: 'compose',
      bitcoin_rpcuser: 'bitcoin',
      bitcoin_rpcpassword: 'CHANGEME',
      bitcoin_uacomment: '',
      bitcoin_prune: false,
      bitcoin_prune_size: 550,
      bitcoin_datapath: '',
      bitcoin_node_ip: '',
      bitcoin_mode: 'internal',
      bitcoin_expose: false,
      lightning_expose: true,
      gatekeeper_port: 2009,
      gatekeeper_ipwhitelist: '',
      gatekeeper_keys: { configEntries: [], clientInformation: [] },
      gatekeeper_sslcert: '',
      gatekeeper_sslkey: '',
      gatekeeper_cns: process.env['DEFAULT_CERT_HOSTNAME'] || '',
      gatekeeper_datapath: '',
      proxy_datapath: '',
      lightning_implementation: 'c-lightning',
      lightning_external_ip: '',
      lightning_datapath: '',
      lightning_nodename: name.generate(),
      lightning_nodecolor: '',
      otsclient_datapath: '',
      traefik_datapath: '',
      installer_cleanup: false,
      default_username: process.env.DEFAULT_USER || '',
      gatekeeper_version: process.env.GATEKEEPER_VERSION || 'latest',
      proxy_version: process.env.PROXY_VERSION || 'latest',
      proxycron_version: process.env.PROXYCRON_VERSION || 'latest',
      pycoin_version: process.env.PYCOIN_VERSION || 'latest',
      otsclient_version: process.env.OTSCLIENT_VERSION || 'latest',
      bitcoin_version: process.env.BITCOIN_VERSION || 'latest',
      lightning_version: process.env.LIGHTNING_VERSION || 'latest',
      sparkwallet_version: process.env.SPARKWALLET_VERSION || 'standalone'
    }, this.props );

  }

  isChecked(name, value ) {
    return this.props && this.props[name] && this.props[name].indexOf(value) != -1 ;
  }

  getDefault(name ) {
    return this.props && this.props[name];
  }

  optional(input, validator) {
    if( input === undefined ||
        input === null ||
        input === '' ) {
      return true;
    }
    return validator(input);
  }

  ipOrFQDNValidator(host ) {
    host = (host+"").trim();
    if( !(validator.isIP(host) ||
      validator.isFQDN(host)) ) {
      throw new Error( 'No IP address or fully qualified domain name' )
    }
    return true;
  }

  xkeyValidator(xpub ) {
    // TOOD: check for version
    if( !coinstring.isValid( xpub ) ) {
      throw new Error('Not an extended key.');
    }
    return true;
  }

  pathValidator(p ) {
    return true;
  }

  derivationPathValidator(path ) {
    return true;
  }

  colorValidator(color) {
    if( !validator.isHexadecimal(color) ) {
      throw new Error('Not a hex color.');
    }
    return true;
  }

  lightningNodeNameValidator(name) {
    if( !name || name.length > 32 ) {
      throw new Error('Please enter anything shorter than 32 characters');
    }
    return true;
  }

  notEmptyValidator(path ) {
    if( !path ) {
      throw new Error('Please enter something');
    }
    return true;
  }

  usernameValidator(user ) {
     if( !userRegexp.test( user ) ) {
      throw new Error('Choose a valid username');
    }
    return true;
  }

  UACommentValidator(comment ) {
    if( !uaCommentRegexp.test( comment ) ) {
      throw new Error('Unsafe characters in UA comment. Please use only a-z, A-Z, 0-9, SPACE and .,:_?@');
    }
    return true;
  }

  trimFilter(input ) {
    return (input+"").trim();
  }

  featureChoices() {
    return this.features;
  }

  getHelp(topic ) {
    if( !this.props.enablehelp || !this.help ) {
      return '';
    }

    const helpText = this.help[topic] || this.help['__default__'];

    if( !helpText ||helpText === '' ) {
      return '';
    }

    return "\n\n"+wrap( html2ansi(helpText),82 )+"\n\n";
  }

};
