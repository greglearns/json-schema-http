var SchemaStub = require('./schema-stub')

// TODO: ensure all defined Fns are used and assigned to a slug
// TODO: ensure slugs are unique

module.exports = function(opts) {
  var schemaStub = SchemaStub({ schema: opts.schema || {}, log: opts.log || console.log })
  var listOfLinks = schemaStub.listOfLinks().map(function(linkSet) { return {
    href: linkSet.href,
    method: linkSet.method,
    rel: linkSet.rel,
    title: linkSet.title,
    description: linkSet.description
  }})

  return {
    listOfLinks: listOfLinks,
    stub: schemaStub.stub
  }
};

