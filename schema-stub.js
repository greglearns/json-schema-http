var Validator = require('./validate')
var JSONPath = require('JSONPath').eval
  // other options than JSONPath:
  // https://github.com/bojand/json-schema-deref-sync
  // mpath
  // propSearch

module.exports = function(opts) {
  var orig = opts.schema
  var copy = clone(opts.schema)
  var schema = expand(copy, copy)

  return {
    listOfLinks: listOfLinks.bind(null, schema),
    stub: stub.bind(null, schema)
  }
}

function listOfLinks(schema) {
  return propertyLinks().concat(processLinks(schema.links, [] ))

  function propertyLinks() {
    return flatten( Object.keys(schema.properties || []).map(addPathToLinkSets) ).filter(identity)

    function addPathToLinkSets(path) {
      return processLinks(schema.properties[path].links || [], [ 'properties', path ])
    }

  }

  function processLinks(links, useThisPath) {
    return ( links || [] ).map(function(linkSet, index) {
      var cloned = clone(linkSet);
      cloned.schema_path = [ '#', useThisPath.join('/'), 'links', index ].filter(identityButKeepZeros).join('/')
      return cloned
    })
  }

}

function stub(schema, server, fns) {
  var generated = {}

  listOfLinks(schema)
  .forEach( generateServerRouteStub.bind(null, fns || {}) )

  function generateServerRouteStub(fns, linkSet) {
    var path = linkSet.schema_path

    // var route = linkSet.href.replace(/{[^}]+}/g, function() { return '[^/]+?' })
    var route = linkSet.href.replace(/{([^}]+?)}/, function(_,paramName) { return ':'+paramName  })
    var isRequestValid = Validator({ schema: linkSet.schema || {}, basePath: path }).validate
    var isResponseValid = Validator({ schema: linkSet.targetSchema || {}, basePath: path }).validate

    var uniqueSlug = linkSet.unique_slug
    var fnForSlug = functionForSlug(uniqueSlug)

    var generatedKey = [ linkSet.method, route ].join(' ')

    if (fnForSlug) {
      if (generated[ generatedKey ] === 'real' ) {
        console.log(JSON.stringify({ route_reuse: { type: 'real', reuse: true, method: linkSet.method, route: route, path: path, slug: uniqueSlug } }))
      } else {
        console.log(JSON.stringify({ route_create: { type: 'real', method: linkSet.method, route: route, path: path, slug: uniqueSlug } }))
        console.log('route is', linkSet.method.toLowerCase(), route);
        server[linkSet.method.toLowerCase()](route, validateRequest, fnForSlug.bind(null, { validateRequest: isRequestValid }))
        generated[ generatedKey ] = 'real'
      }
    } else {
      if (generated[ generatedKey ] === 'real' ) {
        console.log(JSON.stringify({ route_reuse: { type: 'real', reuse: true, method: linkSet.method, route: route, path: path, slug: uniqueSlug } }))
      } else {
        console.log(JSON.stringify({ route_stub: { type: 'STUB', method: linkSet.method, route: route, path: path, slug: uniqueSlug } }))
        server[linkSet.method.toLowerCase()](route, validateRequest, handler)
      }
    }

    function functionForSlug(slug) {
      if (!slug) { return }
      if (typeof slug === 'string') {
        return slug.match(/^\//) ? pathTo(fns, slug) : fns[slug]
      }
      if (slug.kind) {
        return ( fns[slug.kind] || {} )[slug.name]
      }
    }

    function pathTo(obj, path) {
      var parts = path.split('/')
      if (parts[0] === "") { parts.shift() }
      var len = parts.length
      while (len-- > 0) {
        obj = obj[ parts.shift() ]
        if (!obj) { return }
      }
      return obj
    }

    function validateRequest(req, res, next) {
      console.log('validate Request', req.params, linkSet.schema)
      try {
      var report = isRequestValid(req.params)
      if (report.valid) { next(); return }
      } catch(e) {
        res.status(400)
        res.json({
          status: 400,
          message: "error processing json",
          error: e
        })
        return
      }

      res.status(400)
      res.json({
        status: 400,
        message: "bad syntax in body",
        error: report.errors
      })
    }

    function validateResponse(data, res) {
      console.log('validate response', data, linkSet.targetSchema || {})
      var report = isResponseValid(data)
      if (report.valid) { return true }

      res.status(500)
      res.json({
        status: 500,
        message: "bad syntax in response body: this is an error with the server, not with your code",
        error: report.errors
      })

      return false
    }

    function handler(req, res, next) {
      var result = JSONPath(linkSet, '$.targetSchema.example')[0]
      if (!validateResponse(result, res)) { next(); return }

      var contentType = linkSet.mediaType || 'application/json'
      res.header('Content-Type', contentType);
      console.log('-------------')
      console.log('this is the result', typeof result)
      console.log(result)
      console.log('-------------')
      res.send(result)
      next()
    }
  }

}

function expand(root, node) {
  if (!node) { return  node}
  if (typeof node !== 'object') { return node}
  if (node instanceof Array) {
    var i = node.length
    while(i--) {
      node[i] = expand(root, node[i])
    }
    return node
  }
  Object.keys(node).forEach(function(key) {
    node[key] = expand(root, node[key])
  })
  if (node['$ref']) {
    return jsonPath( root, node['$ref'] )
  }
  return node
}

function clone(o) { return JSON.parse(JSON.stringify(o)) }

function jsonPath(root, path) {
  // path = path.replace(/\$\./,'')
  path = path.replace(/#\//,'')
  var parts = path.split('/')
  return parts.reduce(function(sum, part) {
    // if (sum === undefined) { return undefined }
    sum = sum[part]
    if (sum === undefined) {
      // TODO: a $ref is dereferencing a non-existant path. What should we do? throw an error, log it, or ... ?
      return {}
    }
    return sum
  }, root)
}

function flatten(val) {
  return [].concat.apply([],val)
}

function identity(x) { return x }
function identityButKeepZeros(x) { return x || x === 0 }

