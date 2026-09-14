"use client"

import { useEffect, useRef, useState } from "react";

export default function useInView(repeat, delay = 0, position = '0px 0px 0px 0px') {

    const [inView, setInView] = useState()
    const [repeated, setRepeated] = useState(false)

    const ref = useRef(null)

    useEffect(() => {
        const observerCallback = (entries) => {
            entries.forEach((entry) => {
                if (repeat) {
                    if (entry.isIntersecting) {
                        setInView(true)
                    } else {
                        setInView(false)
                    }
                } else {
                    if (entry.isIntersecting) {
                        if (repeated) {
                            setInView(false)
                            setRepeated(false)
                        } else {
                            setInView(true)
                            setRepeated(true)
                        }
                    }
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, {threshold: delay, rootMargin: position});
        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => {
            observer.disconnect();
        };
    }, []);

    return [ref, inView]
}