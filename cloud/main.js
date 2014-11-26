require("cloud/app.js");
// Use AV.Cloud.define to define as many cloud functions as you want.
// For example:

var ChannelProduct = AV.Object.extend('ChannelProduct')
var ChannelProductHistory = AV.Object.extend('ChannelProductHistory')

var Product = AV.Object.extend('Product')
var ProductHistory = AV.Object.extend('ProductHistory')

var ChannelProductSnapshot = AV.Object.extend('ChannelProductSnapshot')

var _ = require('underscore')

var datasource = require('cloud/datasource')()
var utils = require('cloud/utils')

ChannelProduct.getById = function (id) {
  return new AV.Query(ChannelProduct).get(id)
}

ChannelProductHistory.getByCPId = function (id) {
  var query = new AV.Query(ChannelProductHistory)
  query.equalTo('channelProduct', new ChannelProduct({id: id}))
  return query.first()
}

function getDailyKey(timestamp) {
  function pad(num) {
    return (num > 9) ? num : '0' + num
  }

  var date = new Date(timestamp)
  return date.getFullYear() + "-"
    + pad(date.getMonth()) + "-"
    + pad(date.getDate())
}

function getHourlyKey(timestamp) {
  function pad2(num) {
    return (num > 9) ? num : '0' + num
  }

  var date = new Date(timestamp)
  return date.getFullYear() + "-"
    + pad2(date.getMonth()) + "-"
    + pad2(date.getDate()) + "-"
    + pad2(date.getHours())
}

//{
//  "cpId":"546adbf0e4b00084d99017d3",
//  "record":-1
//}

//var test = {
//  "cpId": "546adbf0e4b00084d99017d3",
//  "record": {"timestamp": 1416990045345, "commentCount": 2}
//}

var OMITTED_RECORD_KEYS = ['createdAt', 'updatedAt', 'channelId', 'timestamp', 'indexer', 'expiredIn']
function coreRecord(record) {
  return _.omit(record, OMITTED_RECORD_KEYS)
}

function snapshotCP(channelProduct, resolve, reject) {
  // TODO invoke the real crawl APIs
  console.log('%s:%s',
    channelProduct.id,
    channelProduct.get('channel').get('name'))
  setTimeout(function () {
    resolve({
      brief: '我是个好应用呀',
      commentCount: 123,
      rateCount: 32,
      rateValue: 3.2,
      downloadCount: 3249,
      timestamp: new Date().getTime(),
      expiredIn: 1000 * 60 * 60 * 1
    })
  }, 2000)
}

function rankCP(channelProduct, resolve, reject) {
  resolve({
    timestamp: new Date().getTime(),
    rankValue: 3.3,
    expiredIn: 1000 * 60 * 60 * 1
  })
}

function updateChannelProduct(cp, lifeChange, expireChanged) {
  var newExpireAt = new Date(new Date().getTime() + expireChanged)
  cp.set('snapshottedAt', newExpireAt)
  if (lifeChange) {
    var live = cp.get('life')
    cp.set('life', live - 1)
  } else {
    cp.set('life', 10)
  }
  return cp.save()
}

AV.Cloud.define('rankExpired', function (request, response) {
  datasource.getAllNeedRank()
    .then(function (expireds) {
      function _doNext() {
        if (expireds.length === 0) {
          return
        }
        var cp = expireds[0]
        utils.synchronize(rankCP, cp)
          .then(function (record) {
            var newRankAt = new Date(new Date().getTime() + record.expiredIn)
            cp.set('rankedAt', newRankAt)
            cp.set('rankValue', record.rankValue)
            return AV.Promise.when([
              AV.Cloud.run('channelProductHistory',
                {
                  cpId: cp.id,
                  record: record
                }),
              cp.save()
            ])
          }, function (err) {
            return AV.Promise.as({})
          }).then(function (results) {
            expireds = expireds.slice(1)
            _doNext()
          }, function (err) {
            console.error(err)
          })
      }

      _doNext()
      response.success(expireds)
    }, function (err) {
      console.error(err)
      response.error(err)
    })
})

AV.Cloud.define('snapshotExpired', function (request, response) {
  datasource.getAllExpired()
    .then(function (expireds) {
      console.log('found expired,%s', expireds.length)

      // crawl all one by one
      function _snapshot() {
        if (expireds.length === 0) {
          return
        }
        var cp = expireds[0]
        utils.synchronize(snapshotCP, cp)
          .then(function (record) {
            expireds = expireds.slice(1)

            return AV.Promise.when([
              updateChannelProduct(cp, undefined, record.expiredIn),
              new ChannelProductSnapshot({
                record: record,
                channelProduct: cp,
                channel: cp.get('channel')
              }).save()
            ])
          }, function (err) {
            expireds = expireds.slice(1)
            return updateChannelProduct(cp, -1)
          }).then(function (results) {
            console.log('completed,%s', cp.id)
            _snapshot()
          }, function (err) {
            console.error(err)
          })
      }

      _snapshot()
      response.success(expireds)
    }, function (err) {
      console.error(err)
      response.error(err)
    })

})

AV.Cloud.define("channelProduct", function (request, response) {
  console.log('update CP')
  var cpId = request.params.cpId
  var record = request.params.record
  ChannelProduct.getById(cpId)
    .then(function (channelProduct) {
      channelProduct.set('detail', coreRecord(record))
      channelProduct.set('name', channelProduct.get('name') || record.name)
      return channelProduct.save()
    }).then(function (cp) {
      response.success(cp)
    }, function (err) {
      console.error(err)
      response.error(err)
    })
});

AV.Cloud.define("changeCPLife", function (request, response) {
  var delta = parseInt(request.params.delta)
  ChannelProduct.getById(request.params.cpId)
    .then(function (cp) {
      cp.set('life', (delta) ?
        (cp.get('life') + delta ) :
        10)
      return cp.save()
    }).then(function (cp) {
      response.success(cp)
    }, function (err) {
      response.error(err)
    })
});

AV.Cloud.define("channelProductHistory", function (request, response) {
  var cpId = request.params.cpId
  var record = request.params.record

  AV.Promise.when([
    ChannelProduct.getById(cpId),
    ChannelProductHistory.getByCPId(cpId)
  ]).then(function (channelProduct, history) {
    if (!record.timestamp) {
      return AV.Promise.error('timestamp is necessary')
    }
    record.timestamp = parseInt(record.timestamp)
    if (!_.isNumber(record.timestamp)) {
      return AV.Promise.error('invalid timestamp,' + record.timestamp)
    }

    function buketize(bucketArray, labelizer) {
      var indexValue = labelizer(record.timestamp)
      var bucket = (function () {
        var result = _.find(bucketArray, {indexer: indexValue})
        return (_.isEmpty(result)) ?
          (function () {
            result = {indexer: indexValue}
            bucketArray.push(result)
            return result
          })() : result
      })()
      _.each(coreRecord(record),
        function (value, key) {
          bucket[key] = value
        })
    }

    function sortByLabel(array) {
      return _.sortBy(array, function (d) {
        return d.indexer
      })
    }

    // Filling daily
    // daily in history is a object
    var dailyArray = history.get('daily') || []
    buketize(dailyArray, getDailyKey)
    history.set('daily', _.first(sortByLabel(dailyArray), 90))

    var hourlyArray = history.get('hourly') || []
    buketize(hourlyArray, getHourlyKey)
    history.set('hourly', _.first(sortByLabel(hourlyArray), 480))

    return history.save()
  }).then(function (history) {
    response.success(history)
  }, function (err) {
    console.error(err)
    response.error(err)
  })
})

AV.Cloud.afterSave('ChannelProductSnapshot', function (request) {
  // changeCPLife(cp)
  console.log('aftersave ChannelProductSnapshot,%s', JSON.stringify(request.object))
  AV.Cloud.run('channelProductHistory',
    {
      cpId: request.object.get('channelProduct').id,
      record: request.object.get('record')
    },
    {
      success: function (result) {
        console.log('update CPH completed')
      },
      error: function (error) {
      }
    })
  AV.Cloud.run('channelProduct',
    {
      cpId: request.object.get('channelProduct').id,
      record: request.object.get('record')
    },
    {
      success: function (result) {
        console.log('update CP completed')
      },
      error: function (error) {
      }
    })
})

AV.Cloud.afterSave('Product', function (request) {
  new ProductHistory({
    product: request.object
  }).save()
})

AV.Cloud.afterSave('ChannelProduct', function (request) {
  new ChannelProductHistory({
    channelProduct: request.object,
    channel: request.object.get('channel')
  }).save()
})

AV.Cloud.afterSave('Event', function (request) {
  if ('news' === request.object.get('type')) {
    // A news about product
    // TODO Send it to all users followed it
  } else if ('inc_dl' === request.object.get('type')) {
    // Abnormal increasing downloads
    // TODO Send it to all users followed it
  }
})
