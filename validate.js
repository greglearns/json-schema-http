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

      if (error.code === 'OBJECT_MISSING_REQUIRED_PROPERTY') {
        handleMissingRequired(error, report)
      }

      if (error.code === 'OBJECT_ADDITIONAL_PROPERTIES') {
        handleExtraFields(error, report)
      }


      return {
        message: error.message,
        absolute_schema_path: ( error.absolute_schema_path || '').replace(/^0#/,basePath +'/schema')
      }
    })
  }

  return report
}

function handleMissingRequired(error, report) {
  report.missing_fields || (report.missing_fields={})
  var match = error.message && error.message.match(/'([^']+)'/)
  if (match) {
    var field = match[1] || 'unknown_field'
    report.missing_fields[field] = (report.missing_fields[field] || 0)+1
  }
}

function handleExtraFields(error, report) {
  report.disallowed_fields || (report.disallowed_fields={})
  var match = error.message && error.message.match(/(\[[^\]]+\])/)
  if (match) {
    var fields = tryJson(match[0]) || [ 'unknown_field' ]
    fields.forEach(function(field) {
      report.disallowed_fields[field] = (report.disallowed_fields[field] || 0)+1
    })
  }

  function tryJson(str) {
    try { return JSON.parse(str) } catch(e) { return str }
  }
}

