module.exports=variableRewrites

function variableRewrites(params, str) {
  var regex = /{{([^}]+)}}/g
  params || (params={})
  return str.replace(regex, (original, name) => {
    return params[name] === undefined ? original : params[name]
  })
}

