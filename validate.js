var Themis = require('themis')

module.exports = function(opts) {
  var schema = opts.schema || {}
  var validator = Themis.validator(schema);
  var basePath = opts.basePath
  var id = schema.id || '0'

  return {
    validate: validate.bind(null, id, basePath, validator)
  }
}

function validate(schemaId, basePath, validator, data) {
  var report = validator(data, schemaId);
  if (! report.valid) {
    report.errors = report.errors.map(function(error) {
      if (error.validator === 'not') {
        error.message += ': '+JSON.stringify(error.validator_value)
      }

      return {
        message: error.message,
        absolute_schema_path: ( error.absolute_schema_path || '').replace(/^0#/,basePath +'/schema')
      }
    })
  }
  return report
}

