/**
 * 工具模块
 */
define('util', [], function() {
  'use strict'

  var STORAGE_INSTANCE = undefined
  var DEFAULT_EXPIRE = 3 * 60 * 60 * 1000 // 默认过期时间3小时

  /**
   * 缓存模块
   */
  var STORAGE = (function() {
    function getInstance(type) {
      if (type === 'session' && STORAGE_INSTANCE !== window.sessionStorage) {
        STORAGE_INSTANCE = window.sessionStorage
      } else if (STORAGE_INSTANCE !== window.localStorage) {
        STORAGE_INSTANCE = window.localStorage
      }

      return this
    }

    function getNow() {
      return new Date().getTime()
    }

    function get(key) {
      var value
      try {
        value = JSON.parse(STORAGE_INSTANCE.getItem(key))

        if (value) {
          var now = getNow()
          if (value.expireTime < now) {
            value = null
          }
        }
      } catch (e) {
        console.warn('key', e)
        value = null
      }

      return value
    }

    function set(key, value, expire) {
      value = value || {}
      key = key && key.toLocaleUpperCase()

      if (value) {
        var now = getNow()
        value.setTime = now
        value.expireTime = now + (expire || DEFAULT_EXPIRE)

        try {
          value = JSON.stringify(value)
        } catch (e) {
          console.warn('key', e)
          value = ''
        }

        STORAGE_INSTANCE.setItem(key, value)
      } else {
        return false
      }
    }

    function remove() {}

    return {
      get: get,
      set: set,
      remove: remove,
      getInstance: getInstance
    }
  })()

  /**
   * 消抖
   * 当调用函数n秒后，才会执行该动作，若在这n秒内又调用该函数则将取消前一次并重新计算执行时间
   * @param {*} fn
   * @param {*} delay
   */
  function debounce(fn, delay) {
    let _this = this,
      timer = null

    return function(e) {
      if (timer) {
        clearTimeout(timer)
        timer = setTimeout(function() {
          fn.call(_this, e.target.value)
        }, delay)
      } else {
        timer = setTimeout(function() {
          fn.call(_this, e.target.value)
        }, delay)
      }
    }
  }

  return {
    STORAGE: STORAGE,
    debounce: debounce
  }
})
;
/**
 * ServiceWorker模块
 */
define('registerSW', ['jquery'], function($) {
  function register() {
    navigator.serviceWorker
      .register('/sw.js', { scope: `/` })
      .then(function(registration) {
        console.info('sw register success---', registration.scope)
        var activeWorker = registration.active
        registration.onupdatefound = () => {
          var installingWorker = registration.installing
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              console.info('sw installing state---', installingWorker.state)
            }
          }
          if (activeWorker) {
            activeWorker.onstatechange = () => {
              console.info('sw active state---', activeWorker.state)
              activeWorker.state == 'redundant' && window.location.reload()
            }
          }
        }

        // 发送消息，sw监听事件message接收
        registration.active && registration.active.postMessage('success')
      })
      .catch(function(e) {
        console.warn('register sw failed---', e)
      })

    // 监听安装
    window.addEventListener('beforeinstallprompt', e => {
      window.dfdPrompt = e
      // 阻止默认事件
      e.preventDefault()
      return false
    })
  }

  // 监听注册sw事件
  document.addEventListener(
    'registerSwEvent',
    function(e) {
      register()
    },
    false
  )

  if (
    HUHU_CONFIG &&
    HUHU_CONFIG.service_worker &&
    HUHU_CONFIG.service_worker.open &&
    'serviceWorker' in navigator &&
    window.caches &&
    navigator.serviceWorker.getRegistration
  ) {
    navigator.serviceWorker
      .getRegistration(`/`)
      .then(function(registration) {
        if (
          !HUHU_CONFIG.service_worker ||
          (HUHU_CONFIG.service_worker && !HUHU_CONFIG.service_worker.open)
        ) {
          registration &&
            registration.scope &&
            registration
              .unregister()
              .then(() => console.log('unregister older sw success!'))
              .catch(e => console.error(`unregister older sw failed!---`, e))
          return
        }

        // 注册事件
        var event = new Event('registerSwEvent')

        // 不存在SW or 新的SW已存在
        if (!registration || registration.scope === window.location.origin + '/') {
          document.dispatchEvent(event) // 注册新sw
          return
        }

        // scope不为'/'，就注销旧的服务
        if (registration.scope) {
          registration
            .unregister()
            .then(flag => {
              if (flag) {
                console.log('unregister older sw success!')
                document.dispatchEvent(event) // 注册新sw
              }
            })
            .catch(e => {
              console.error('unregister older sw failed!---', e)
            })
        }
      })
      .catch(e => {
        console.error('get older sw failed!---', e)
      })
  }
})
;
/**
 * 分享模块
 */
define('share',['jquery', 'confirm'], function($) {
  'use strict'

  var DEFAULT_SITES = ['weibo', 'qq', 'wechat', 'douban', 'qzone', 'facebook', 'twitter', 'google']

  var TEMP = {
    qqkongjian:
      'http://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url={{URL}}&title={{TITLE}}&desc={{DESCRIPTION}}&summary={{SUMMARY}}&site={{SOURCE}}&pics={{IMAGE}}',
    QQ:
      'http://connect.qq.com/widget/shareqq/index.html?url={{URL}}&title={{TITLE}}&source={{SOURCE}}&desc={{DESCRIPTION}}&pics={{IMAGE}}',
    weibo: 'https://service.weibo.com/share/share.php?url={{URL}}&title={{TITLE}}&pic={{IMAGE}}&appkey={{WEIBOKEY}}',
    weixin: 'javascript:;',
    douban:
      'http://shuo.douban.com/!service/share?href={{URL}}&name={{TITLE}}&text={{DESCRIPTION}}&image={{IMAGE}}&starid=0&aid=0&style=11',
    facebook:
      'https://www.facebook.com/sharer/sharer.php?u={{URL}}&title={{TITLE}}&description={{DESCRIPTION}}&caption={{SUBHEAD}}&link={{URL}}&picture={{IMAGE}}',
    twitter: 'https://twitter.com/intent/tweet?text={{TITLE}}&url={{URL}}&via={{SITE_URL}}',
    google: 'https://plus.google.com/share?url={{URL}}'
  }

  function handleHref(type, data) {
    var href = TEMP[type] || ''
    data.summary = data.description
    Object.keys(data).map(function(key) {
      let reg = key.toUpperCase() || ''
      href = href.replace(new RegExp('{{' + reg + '}}', 'g'), data[key])
    })

    return href
  }

  $.fn.share = function(options) {
    var defaultOptions = {
      url: location.href,
      sites: DEFAULT_SITES,
      site_url: location.origin,
      source:
        $(document.head)
          .find('[name=site]')
          .attr('content') || document.title,
      title:
        $(document.head)
          .find('[name=title]')
          .attr('content') || document.title,
      description:
        $(document.head)
          .find('[name=description]')
          .attr('content') || '',
      image: $('img:first').prop('src') || '',
      weiboKey: ''
    }

    options = $.extend({}, defaultOptions, options)

    var site_temp = ''
    options.sites.map(function(v) {
      site_temp += `<a href="${handleHref(v, options)}" target="_blank">
                      <span class="iconfont icon-${v}"></span> 
                    </a>`
    })

    var content = `<div id="share">
                        ${site_temp}
                  </div>`

    $.confirm({
      title: 'Share',
      useBootstrap: false,
      boxWidth: '15rem',
      escapeKey: 'true',
      animation: 'rotateYR',
      content: content,
      buttons: {
        close: {
          text: 'Close'
        }
      }
    })
  }
})
;
/**
 * 站内搜索
 */
define('search',['jquery', 'util'], function($, $H) {
  'use strict'

  var SEARCH_KEY = 'SEARCH'
  var SEARCH_EXPIRE = 30 * 24 * 60 * 60 * 1000 // 默认过期时间30天
  var resultBoxDom = $('#result-box')
  var resultConutBoxDom = $('#result-count')
  var _img_temp = `<div class="left" style="background-image: url('{IMG}')"></div>`
  var _temp = `<li>
                <a href="{PERMALINK}" target="_blank">
                  {IMG_TEMP}
                  <div class="right">
                    <div class="title">{TITLE}</div>
                    <div class="time">{TIME}</div>
                    <div class="intro">{INTRO}</div>
                  </div>
                </a>
              </li>`

  function getStatic() {
    return $H.STORAGE.getInstance().get(SEARCH_KEY)
  }

  function setStatic(value) {
    return $H.STORAGE.getInstance().set(SEARCH_KEY, value, SEARCH_EXPIRE)
  }

  function getSeatchData() {
    let content = getStatic()
    if (!content) {
      return fetch('/content.json', { method: 'GET' })
        .then(resp => resp.json())
        .then(json => {
          json && setStatic(json)
          return json
        })
        .catch(error => console.log('fetch failed', error))
    } else {
      return Promise.resolve(content)
    }
  }

  /**
   * 匹配
   */
  function matcher(post, key) {
    // 关键字 => 正则，空格隔开的看作多个关键字
    // a b c => /a|b|c/gmi
    // g 全局匹配，m 多行匹配，i 不区分大小写
    var regExp = new RegExp(key.replace(/[ ]/g, '|'), 'gmi')

    // 匹配优先级：title > tags > text
    return (
      regExp.test(post.title) ||
      post.tags.some(function(tag) {
        return regExp.test(tag.name)
      }) ||
      regExp.test(post.text)
    )
  }

  function inputSearch(key) {
    if (key) {
      // 尝试获取数据
      getSeatchData().then(data => {
        let posts = data.posts

        if (posts.length) {
          let result
          result = posts.filter(post => matcher(post, key))
          resultConutBoxDom.html(result.length)

          if (result.length) {
            let _li = ''
            for (let i = 0; i < result.length; i++) {
              let _img = ''
              if (result[i].photos.length > 0) {
                _img = _img_temp.replace('{IMG}', result[i].photos[0])
              }

              _li += _temp
                .replace('{PERMALINK}', result[i].permalink)
                .replace('{TITLE}', result[i].title)
                .replace('{IMG_TEMP}', _img)
                .replace('{TIME}', result[i].date)
                .replace('{INTRO}', result[i].text.substring(0, 100) + '...')
            }
            resultBoxDom.html(_li)
          } else {
            resultBoxDom.html(`<li><a href="#">无结果</a></li>`)
          }
        }
      })
    } else {
      resultBoxDom.html('')
      resultConutBoxDom.html(0)
    }
  }

  $(document).on('input', '.input-wrap > input', $H.debounce(inputSearch, 300))
})
;
require(['jquery', 'util', 'valine', 'registerSW', 'fancybox', 'confirm', 'share', 'search'], function(
  $,
  util,
  valine
) {
  'use strict'

  // valine评论
  var API_ID = (HUHU_CONFIG.valine && HUHU_CONFIG.valine.API_ID) || ''
  var API_KEY = (HUHU_CONFIG.valine && HUHU_CONFIG.valine.API_KEY) || ''
  if (API_ID && API_KEY) {
    new valine({
      el: '#comment',
      appId: HUHU_CONFIG.valine.API_ID,
      appKey: HUHU_CONFIG.valine.API_KEY,
      notify: false,
      visitor: true,
      recordIP: true,
      avatar: 'mp',
      placeholder: '骑士很煎蛋、骑士很孜然'
    })
  }

  // 阻止冒泡
  function stopPropagation(e) {
    e.stopPropagation ? e.stopPropagation() : (e.cancelBubble = true)
  }

  // bind events
  $(document).ready(function() {
    // 图片预览
    $('[data-fancybox="images"]').fancybox({ loop: true })

    // 侧边菜单
    $(document).on('click', '.toggle-icon', function() {
      $('#side').hasClass('active') ? $('#side').removeClass('active') : $('#side').addClass('active')
    })

    // phone menu
    $(document).on('click', '.menu-icon', function() {
      $('#menu-mask').toggleClass('showMenuMask')
      $('body').toggleClass('overflow')
    })

    $(document).on('click', '#menu-mask .icon-close', function() {
      $('#menu-mask').toggleClass('showMenuMask')
      $('body').toggleClass('overflow')
    })

    // search
    $(document).on('click', '.search-box', function() {
      $('#search-shade').toggleClass('showSearchBounce')
      $('body').toggleClass('overflow')
    })

    $(document).on('click', '#search-shade .icon-close', function() {
      $('#search-shade').toggleClass('showSearchBounce')
      $('body').toggleClass('overflow')
    })

    // 分享
    $(document).on('click', '.share', function(e) {
      var that = $(this)
      $().share({
        url: `${location.origin}${that.data('url')}` || location.href,
        sites: HUHU_CONFIG.share
      })
      stopPropagation(e)
    })

    // 咖啡
    $(document).on('click', '#reward-button', function(e) {
      $('#qr').toggle('1000')
    })

    // 顶部滚动进度条
    $(window).scroll(function(e) {
      var pageHeight = document.documentElement.scrollHeight || document.body.scrollHeight // 页面总高度
      var windowHeight = document.documentElement.clientHeight || document.body.clientHeight // 浏览器视口高度
      var scrollAvail = pageHeight - windowHeight // 可滚动的高度
      var scrollTop = document.documentElement.scrollTop || document.body.scrollTop // 获取滚动条的高度
      var ratio = (scrollTop / scrollAvail) * 100 + '%'
      $('#progress > .line').css('width', ratio)
    })

    var mousewheel = function(e) {
      e = e || window.event

      //判断浏览器IE，谷歌滑轮事件
      if (e.wheelDelta) {
        //当滑轮向上滚动时
        if (e.wheelDelta > 0) {
          $('#side').removeClass('active')
        }

        //当滑轮向下滚动时
        if (e.wheelDelta < 0) {
          $('#side').addClass('active')
        }
      }
      //Firefox滑轮事件
      else if (e.detail) {
        //当滑轮向上滚动时
        if (e.detail > 0) {
          $('#side').removeClass('active')
        }

        //当滑轮向下滚动时
        if (e.detail < 0) {
          $('#side').addClass('active')
        }
      }
    }

    document.addEventListener && document.addEventListener('DOMMouseScroll', mousewheel, false) //firefox
    window.onmousewheel = document.onmousewheel = mousewheel //滚动滑轮触发scrollFunc方法 ie 谷歌

    // fiexed menu
    $(document).on('click', '#fixed-menu', function() {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
    })

    function handleDisplay() {
      $(this)
        .addClass('active')
        .siblings()
        .removeClass('active')
      var cate = $(this)
        .attr('class')
        .split(' ')[0]
      $('.post-wrap > .post').each(function(post) {
        if ($(this).hasClass(cate)) {
          $(this).addClass('active')
        } else {
          $(this).removeClass('active')
        }
      })
    }

    // 分类、标签页
    $(document).on('click', '#categories > .list > li', handleDisplay)
    $(document).on('click', '#tags > .list > li', handleDisplay)

    // pjax
    if ($.support.pjax) {
      $(document).on('click', 'a[data-pjax]', function(event) {
        var container = $(this).closest('[data-pjax-container]')
        var containerSelector = '#' + container.id
        $.pjax.click(event, { container: containerSelector })
      })
    }
  })
})
;
define("app", function(){});

