var Validator = require('./validate')
var JSONPath = require('JSONPath').eval
var variableRewrite = require('./policy/rewrite')

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
    var route = linkSet.href.replace(/{([^}]+?)}/g, function(_,paramName) { return ':'+paramName  })
    var isRequestValid = Validator({ schema: linkSet.schema || {}, basePath: path }).validate
    var isResponseValid = Validator({ schema: linkSet.targetSchema || {}, basePath: path }).validate

    var uniqueSlug = linkSet.unique_slug
    var fnForSlug = functionForSlug(uniqueSlug)
    var method = linkSet.method.toLowerCase()

    var generatedKey = [ method, route ].join(' ')

    if (fnForSlug) {

      if (fnForSlug.length !== 4) { throw new Error('fn callback must accept 4 arguments: opts, req, res, next: '+uniqueSlug) }
      // if (fnForSlug.length <= 3) { throw new Error('fn callback must accept as the last 4 arguments: opts, req, res, next: '+uniqueSlug) }

      if (generated[ generatedKey ] === 'real' ) {
        console.log(JSON.stringify({ route_reuse: { type: 'real', reuse: true, method: method, route: route, path: path, slug: uniqueSlug } }))
      } else {
        console.log(JSON.stringify({ route_create: { type: 'real', method: method, route: route, path: path, slug: uniqueSlug } }))
        server[method](route, validateRequest, fnForSlug.bind(null, { validateRequest: isRequestValid }))
        generated[ generatedKey ] = 'real'
      }
    } else {
      if (generated[ generatedKey ] === 'real' ) {
        console.log(JSON.stringify({ route_reuse: { type: 'real', reuse: true, method: method, route: route, path: path, slug: uniqueSlug } }))
      } else {
        console.log(JSON.stringify({ route_stub: { type: 'STUB', method: method, route: route, path: path, slug: uniqueSlug } }))
        server[method](route, validateRequest, handler)
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
      // console.log('validate Request', req.params, linkSet.schema)
      try {
        var report = isRequestValid(req.params)
        if (report.valid) { next(); return }
      } catch(e) {
        throw e
        // { error: 'schema-stub', message: e.message, stack: e.stack }
        // res.status(400)
        // res.json({
        //   status: 400,
        //   message: "error processing json",
        //   error: e
        // })
        // return
      }


      var result = {
        status: 400,
        message: "bad syntax in body",
        error: report.errors
      }
      if (report.missing_fields) { result.missing_fields = report.missing_fields }
      if (report.blocked_fields) { result.blocked_fields = report.blocked_fields }

      res.status(result.status || 400)
      res.json(result)
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
      if (result) {
       try{
         result = JSON.parse(variableRewrite(req.params, JSON.stringify(result)))
       } catch(e) {}
      }

      if (!validateResponse(result, res)) { next(); return }

      var contentType = linkSet.mediaType || 'application/json'
      res.header('Content-Type', contentType);

      if (contentType === 'text/event-stream') {

        res.header('Cache-Control', 'no-cache')
        res.header('Connection', 'keep-alive')

        sendOneMessage(clone(result), parseInt(req.params.delay) || 1000, (() => res.end() ))

        function sendOneMessage(arr, timeout, cb) {
          if (!arr.length) { return cb() }
          res.write( toSSE( arr.shift() ))
          setTimeout(() => sendOneMessage(arr, timeout, cb, timeout), timeout)
        }

        function toSSE(x) {
          var result = []
          if (x.comment) { result.push(':'+x.comment) }
          if (x.retry) { result.push('retry:'+ x.retry) }
          if (x.id) { result.push('id:'+x.id) }
          if (x.event) { result.push('event:'+ x.event) }
          if (x.data) { result.push('data:'+JSON.stringify(x.data)) }
          return result.join('\n') + '\n\n'
        }

      } else {
        console.log('-------------')
        console.log('Content-Type', contentType)
        console.log('this is the result', typeof result)
        console.log(result)
        console.log('-------------')
        res.send(result)
      }
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

