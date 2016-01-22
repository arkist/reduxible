import React from 'react';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import ReduxibleRouter from './ReduxibleRouter';
import ReduxibleConfig from './ReduxibleConfig';
import StoreFactory from './StoreFactory';
import createBrowserHistory from 'history/lib/createBrowserHistory';
import createMemoryHistory from 'history/lib/createMemoryHistory';
import { contextMiddleware } from './middlerwares';

export default class Reduxible {
  constructor(options = {}) {
    this.config = new ReduxibleConfig(options.config);
    this.container = options.container;
    this.errorContainer = options.errorContainer;
    this.devTools = options.devTools;
    this.routes = options.routes;
    this.storeFactory = new StoreFactory({ ...options, useDevTools: this.config.useDevTools() });
    this.initialActions = options.initialActions || [];
    this.extras = options.extras || {};
  }

  render(component, store) {
    const Html = this.container;
    const extras = this.extras;
    return '<!doctype html>\n' +
      ReactDOMServer.renderToString(
        <Html component={component} store={store} { ...extras } />
      );
  }

  server() {
    return (req, res, next) => {
      return (async() => {
        if (!this.config.isUniversal()) {
          return res.send(this.render(''));
        }
        const context = {
          server: true,
          ...{ req, res, next }
        };
        const store = this.storeFactory.createStore({}, [ contextMiddleware(context) ]);
        const willDispatch = this.initialActions.map(action => store.dispatch(action()));
        await Promise.all(willDispatch);
        const history = createMemoryHistory();
        const router = new ReduxibleRouter(this.routes, store, history, this.devTools);

        router.route(req.originalUrl, (error, redirectLocation, component)=> {
          if (redirectLocation) {
            return res.redirect(redirectLocation.pathname);
          }

          let renderTarget = component;

          if (error) {
            res.status(500);

            if (this.errorContainer) {
              renderTarget = this.errorContainer;
            } else {
              renderTarget = error;
            }
          }

          return res.send(this.render(renderTarget, store));
        });

        next();
      })();
    };
  }

  client(initialState, dest) {
    const context = {
      client: true
    };
    const store = this.storeFactory.createStore(initialState, [ contextMiddleware(context) ]);
    const history = createBrowserHistory();
    const router = new ReduxibleRouter(this.routes, store, history, this.devTools);

    ReactDOM.render(router.render(), dest);

    if (this.config.useDevTools() && this.devTools) {
      window.React = React;

      // render twice is necessary.
      // if not, React shows invalid server-client DOM sync error.
      ReactDOM.render(router.renderWithDevTools(), dest);
    }
  }
}
