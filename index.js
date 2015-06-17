var SchemaStub = require('./schema-stub')

// TODO: ensure all defined Fns are used and assigned to a slug
// TODO: ensure slugs are unique

module.exports = function(opts) {
  var schemaStub = SchemaStub({ schema: opts.schema || {} })
  var listOfLinks = schemaStub.listOfLinks().map(function(linkSet) { return {
    href: linkSet.href,
    method: linkSet.method,
    rel: linkSet.rel
  }})

  return {
    listOfLinks: listOfLinks,
    stub: schemaStub.stub
  }
};

