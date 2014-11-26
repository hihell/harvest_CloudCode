/**
 * Created by fengxiaoping on 11/26/14.
 */

var Q = require('q')

var ChannelProduct = AV.Object.extend('ChannelProduct')
var ChannelProductHistory = AV.Object.extend('ChannelProductHistory')

var Product = AV.Object.extend('Product')
var ProductHistory = AV.Object.extend('ProductHistory')

var ChannelProductSnapshot = AV.Object.extend('ChannelProductSnapshot')

module.exports = function (context) {
  return {
    getAllExpired: function () {
      var deferred = Q.defer()

      var queryEmpty = new AV.Query(ChannelProduct)
      queryEmpty.doesNotExist('snapshottedAt')

      var queryOld = new AV.Query(ChannelProduct)
      queryOld.lessThan('snapshottedAt', new Date())

      AV.Query.or(queryEmpty, queryOld).find()
        //queryEmpty.find()
        .then(function (results) {
          deferred.resolve(results)
        }, function (err) {
          deferred.reject(err)
        })

      return deferred.promise
    },
    getAllNeedRank: function () {
      var deferred = Q.defer()

      var queryEmpty = new AV.Query(ChannelProduct)
      queryEmpty.doesNotExist('rankedAt')

      var queryOld = new AV.Query(ChannelProduct)
      queryOld.lessThan('rankedAt', new Date())

      AV.Query.or(queryEmpty, queryOld).find()
        //queryEmpty.find()
        .then(function (results) {
          deferred.resolve(results)
        }, function (err) {
          deferred.reject(err)
        })

      return deferred.promise
    }
  }
}

