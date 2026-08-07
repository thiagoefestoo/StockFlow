import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import SuperInfraLogo from './SuperInfraLogo';
import {
  API_REQUEST_END_EVENT,
  API_REQUEST_START_EVENT,
} from '../services/api';

const SHOW_DELAY_MS = 300;
const ROUTE_REQUEST_WINDOW_MS = 2500;
const SETTLE_DELAY_MS = 180;
const SLOW_MESSAGE_MS = 10000;

export default function PageLoadingOverlay() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);
  const visibleRef = useRef(false);
  const pendingRef = useRef(new Set());
  const routeEligibleRef = useRef(true);
  const sawRequestRef = useRef(false);
  const showTimerRef = useRef(null);
  const settleTimerRef = useRef(null);
  const routeWindowTimerRef = useRef(null);
  const slowTimerRef = useRef(null);

  function clearTimer(ref) {
    if (ref.current) window.clearTimeout(ref.current);
    ref.current = null;
  }

  function setLoaderVisible(nextVisible) {
    visibleRef.current = nextVisible;
    setVisible(nextVisible);
  }

  function hideLoader() {
    clearTimer(showTimerRef);
    clearTimer(slowTimerRef);
    setLoaderVisible(false);
    setSlow(false);
  }

  useLayoutEffect(() => {
    const handleRequestStart = (event) => {
      if (!routeEligibleRef.current) return;
      const requestId = event.detail?.id;
      if (!requestId) return;

      pendingRef.current.add(requestId);
      sawRequestRef.current = true;
      clearTimer(settleTimerRef);
      clearTimer(routeWindowTimerRef);

      if (!visibleRef.current && !showTimerRef.current) {
        showTimerRef.current = window.setTimeout(() => {
          showTimerRef.current = null;
          if (pendingRef.current.size > 0 && routeEligibleRef.current) {
            setLoaderVisible(true);
            slowTimerRef.current = window.setTimeout(() => setSlow(true), SLOW_MESSAGE_MS);
          }
        }, SHOW_DELAY_MS);
      }
    };

    const handleRequestEnd = (event) => {
      const requestId = event.detail?.id;
      if (requestId) pendingRef.current.delete(requestId);
      if (!sawRequestRef.current || pendingRef.current.size > 0) return;

      clearTimer(settleTimerRef);
      settleTimerRef.current = window.setTimeout(() => {
        if (pendingRef.current.size === 0) {
          hideLoader();
          routeEligibleRef.current = false;
        }
      }, SETTLE_DELAY_MS);
    };

    window.addEventListener(API_REQUEST_START_EVENT, handleRequestStart);
    window.addEventListener(API_REQUEST_END_EVENT, handleRequestEnd);

    return () => {
      window.removeEventListener(API_REQUEST_START_EVENT, handleRequestStart);
      window.removeEventListener(API_REQUEST_END_EVENT, handleRequestEnd);
      clearTimer(showTimerRef);
      clearTimer(settleTimerRef);
      clearTimer(routeWindowTimerRef);
      clearTimer(slowTimerRef);
    };
  }, []);

  useLayoutEffect(() => {
    pendingRef.current.clear();
    sawRequestRef.current = false;
    routeEligibleRef.current = true;
    hideLoader();
    clearTimer(settleTimerRef);
    clearTimer(routeWindowTimerRef);

    routeWindowTimerRef.current = window.setTimeout(() => {
      if (!sawRequestRef.current) routeEligibleRef.current = false;
    }, ROUTE_REQUEST_WINDOW_MS);
  }, [location.key, location.pathname, location.search]);

  if (!visible) return null;

  return (
    <div className="superinfra-page-loader" role="status" aria-live="polite" aria-label="Carregando página">
      <div className="superinfra-page-loader-card">
        <SuperInfraLogo big />
        <div className="superinfra-page-loader-track" aria-hidden="true">
          <span />
        </div>
        <strong>{slow ? 'A operação está levando um pouco mais de tempo...' : 'Carregando informações...'}</strong>
        <small>{slow ? 'Aguarde, os dados continuam sendo processados.' : 'Aguarde alguns instantes.'}</small>
      </div>
    </div>
  );
}
