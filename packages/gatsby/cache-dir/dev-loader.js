import { BaseLoader, PageResourceStatus } from "./loader"
import { findPath } from "./find-path"

class DevLoader extends BaseLoader {
  constructor(lazyRequires, matchPaths) {
    // One of the tests doesn't set a path.
    const loadComponent = (chunkName, path = `/`) => {
      const realPath = findPath(path)
      if (process.env.NODE_ENV !== `test`) {
        delete require.cache[
          require.resolve(`$virtual/lazy-client-sync-requires`)
        ]
        lazyRequires = require(`$virtual/lazy-client-sync-requires`)
      }
      if (lazyRequires.lazyComponents[chunkName]) {
        return Promise.resolve(lazyRequires.lazyComponents[chunkName])
      } else {
        return new Promise(resolve => {
          // Tell the server the user wants to visit this page
          // to trigger it compiling the page component's code.
          const req = new XMLHttpRequest()
          req.open(`post`, `/___client-page-visited`, true)
          req.setRequestHeader(`Content-Type`, `application/json;charset=UTF-8`)
          req.send(JSON.stringify({ chunkName }))

          // Timeout after 5 seconds (as a precaution webpack fails to update)
          // and hard refresh
          const timeoutTimer = setTimeout(() => {
            clearInterval(checkForUpdates)
            clearTimeout(timeoutTimer)
            // window.location.href = realPath
            window.location.assign(realPath)
          }, 5000)

          const checkForUpdates = setInterval(() => {
            clearTimeout(timeoutTimer)
            if (process.env.NODE_ENV !== `test`) {
              delete require.cache[
                require.resolve(`$virtual/lazy-client-sync-requires`)
              ]
            }
            const lazyRequires = require(`$virtual/lazy-client-sync-requires`)
            if (lazyRequires.lazyComponents[chunkName]) {
              clearInterval(checkForUpdates)
              resolve(lazyRequires.lazyComponents[chunkName])
            }
          }, 250)
        })
      }
    }
    super(loadComponent, matchPaths)
  }

  loadPage(pagePath) {
    const realPath = findPath(pagePath)
    return super.loadPage(realPath).then(result =>
      require(`./socketIo`)
        .getPageData(realPath)
        .then(() => result)
    )
  }

  loadPageDataJson(rawPath) {
    return super.loadPageDataJson(rawPath).then(data => {
      // when we can't find a proper 404.html we fallback to dev-404-page
      // we need to make sure to mark it as not found.
      if (
        data.status === PageResourceStatus.Error &&
        rawPath !== `/dev-404-page/`
      ) {
        console.error(
          `404 page could not be found. Checkout https://www.gatsbyjs.org/docs/add-404-page/`
        )
        return this.loadPageDataJson(`/dev-404-page/`).then(result =>
          Object.assign({}, data, result)
        )
      }

      return data
    })
  }

  doPrefetch(pagePath) {
    return Promise.resolve(require(`./socketIo`).getPageData(pagePath))
  }
}

export default DevLoader
