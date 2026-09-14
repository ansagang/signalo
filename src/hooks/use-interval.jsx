'use client'

import { useState, useEffect, useRef, useCallback } from 'react';

export default function useInterval(callback, delay) {
    const savedCallback = useRef();
    const intervalId = useRef();

    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    const start = useCallback(() => {
        if (intervalId.current) clearInterval(intervalId.current);
        if (delay !== null) {
            intervalId.current = setInterval(() => savedCallback.current(), delay);
        }
    }, [delay]);

    useEffect(() => {
        start();
        return () => clearInterval(intervalId.current);
    }, [start]);

    const reset = useCallback(() => {
        start();
    }, [start]);

    return reset;
}