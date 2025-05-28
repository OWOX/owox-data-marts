const fs = require("fs");
const path = require("path");
const vm = require("node:vm");

const deasync = require('deasync');
global.deasync = deasync;

const request = require("sync-request");
global.request = request;

const AdmZip = require('adm-zip');
global.AdmZip = AdmZip;

const {BigQuery} = require('@google-cloud/bigquery');
global.BigQuery = BigQuery;

const { S3Client, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');
const { Upload } = require('@aws-sdk/lib-storage');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
global.S3Client = S3Client;
global.DeleteObjectsCommand = DeleteObjectsCommand;
global.AthenaClient = AthenaClient;
global.Upload = Upload;
global.ListObjectsV2Command = ListObjectsV2Command;
global.StartQueryExecutionCommand = StartQueryExecutionCommand;
global.GetQueryExecutionCommand = GetQueryExecutionCommand;
global.GetQueryResultsCommand = GetQueryResultsCommand;

// Override Utilities from Google Apps Script
global.Utilities = {
  formatDate: (date, timezone, format) => {
    return date.toISOString().split("T")[0];
  }
}

class Evaluator {

  // TODO: make it relative to the package.json
  DIR_SRC = path.resolve(__dirname, "../../../src");
  DIR_CORE = path.resolve(this.DIR_SRC, "Core");
  DIR_INTEGRATIONS = path.resolve(this.DIR_SRC, "Integrations");
  DIR_CONSTANTS = path.resolve(this.DIR_SRC, "Constants");

  constructor() {
    this.notEvaluatedFiles = [];
  }
  
   getAllSubclasses(baseClass) {
    var globalObject = Function("return this")();
    var allVars = Object.keys(globalObject);
    return allVars.filter(function (key) {
      try {
        var obj = globalObject[key];
        return obj.prototype instanceof baseClass;
      } catch (e) {
        return false;
      }
    });
  }

  evalFile(filePath) {
    console.log(`Evaluating file: ${filePath}`);
    let code = fs.readFileSync(filePath, "utf-8");
    try {
      new vm.Script(code).runInThisContext();
    } catch (e) {
      console.error(e);
    }
  }
  
  evalFolder(folder) {
    console.log(`Evaluating folder: ${folder}`);
    const files = fs.readdirSync(folder);
    
    files.forEach((file) => {
      const filePath = path.resolve(folder, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        this.evalFolder(filePath);
      }
    });

    files.forEach((file) => {
      const filePath = path.resolve(folder, file);
      const stat = fs.statSync(filePath);
      if (file.endsWith(".js")) {
        console.log(`Evaluating file: ${filePath}`);
        let code = fs.readFileSync(filePath, "utf-8");
        try {
          new vm.Script(code).runInThisContext();
        } catch (e) {
          this.notEvaluatedFiles.push(filePath);
        }
      }
    });
  }
  
  evalIntegration(integrationDirectory = "") {
    this.evalFolder(path.resolve(this.DIR_INTEGRATIONS, integrationDirectory));
    this.forceEval();
  }

  evalCore() {
    this.evalFolder(this.DIR_CONSTANTS);
    this.evalFolder(this.DIR_CORE);
    this.forceEval();
  }

  forceEval() {
    if (this.notEvaluatedFiles.length > 0) {
      for (const file of this.notEvaluatedFiles) {
        try {
          this.evalFile(file);
          delete this.notEvaluatedFiles[this.notEvaluatedFiles.indexOf(file)];
        } catch (e) {
          console.error(e);
        }
      }
    }
  
    if (this.notEvaluatedFiles.length > 0 && this.notEvaluatedFiles.filter((file) => file.endsWith(".js")).length > 0) {
      console.log(`Not evaluated files: ${this.notEvaluatedFiles.join(", ")}`);
      process.exit(1);
    }
    
    this.getAllSubclasses(AbstractPipeline).forEach((subclass) => {
      console.log(`Subclass: ${subclass}`);
    });
  }
}

if (process.argv.length < 3) {
  console.error("Please provide a path to the json config file");
  process.exit(1);
}

const evaluator = new Evaluator();
evaluator.evalCore();

class NodeJsConfig extends AbstractConfig {
    constructor(filePath) {
      const rawConfig = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      let config = {};
      console.log(`Create config for pipeline ${rawConfig.name}`);

      config = {
        ...rawConfig.integration.config,
        ...rawConfig.storage.config,
      }

      super(config);

      this.pipelineName = {value: rawConfig.name};
      this.integrationDirectory = {value: rawConfig.integration.directory};
      this.integrationName = {value: rawConfig.integration.name};
      this.storageName = {value: rawConfig.storage.name};
    }

    getPipelineName() {
      return this.pipelineName.value;
    }

    getIntegrationDirectory() {
      return this.integrationDirectory.value;
    }

    getIntegrationName() {
      return this.integrationName.value;
    }

    getStorageName() {
      return this.storageName.value;
    }

    getIntegrationConfig() {
      return this.rawConfig.integration.config;
    }

    updateCurrentStatus(status) {
      console.log(`Updating current status: ${status}`);
    }

    updateLastImportDate() {
      console.log(`Updating last import date`);
    }

    updateLastRequstedDate(date) {
      console.log(`Updating last requested date: ${date}`);
    }

    isInProgress() {
      console.log(`Checking if in progress`);
    }

    addWarningToCurrentStatus() {
      console.log(`Adding warning to current status`);
    }

    logMessage(message, removeExistingMessage = false) {
      console.log(`Logging message: ${message}`);
    }
  }


const configFilePath = process.argv[2];
const config = new NodeJsConfig(configFilePath);
evaluator.evalIntegration(config.getIntegrationDirectory());

const connector = new globalThis[config.getIntegrationName()](config);
const pipeline = new globalThis[config.getPipelineName()](config, connector, config.getStorageName());
  
pipeline.run();