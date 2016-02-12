var expect = require('chai').expect
var subject = require('../../policy/rewrite')

describe('policy/rewrite', function() {
  it('replaces {{hi}} with params.hi', function() {
    var input = "{{hi}}"
    var expected = "there"
    var params = { hi: "there" }
    expect(subject(params, input)).to.eql(expected)
  })

  it('does not replace {{hi}} if no matching params.hi', function() {
    var input = "{{hi}}"
    var expected = "{{hi}}"
    var params
    expect(subject(params, input)).to.eql(expected)
  })

  it('does not handle nested {{}}', function() {
    var input = "{{hi {{}}}}"
    var expected = "{{hi {{}}}}"
    var params = { hi: 'ignored' }
    expect(subject(params, input)).to.eql(expected)
  })

  it('technically, it turns nested ones into the first match', function() {
    var input = "{{hi {{}}}}"
    var expected = "weird}}"
    var params = { 'hi {{': 'weird' }
    expect(subject(params, input)).to.eql(expected)
  })


})

