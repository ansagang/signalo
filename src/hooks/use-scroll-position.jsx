"use client"

import { useState, useEffect } from "react"

function useScrollPosition() {
    const [scrollY, setScrollY] = useState(0)
    const [scrollX, setScrollX] = useState(0)

    useEffect(() => {
        if (window) {
            setScrollX(window.scrollX)
            setScrollY(window.scrollY)
        }
    }, [])

    useEffect(() => {
        window.addEventListener('scroll', scrollEffect)

        return () => window.addEventListener('scroll', scrollEffect)
    })

    const scrollEffect = () => {
        setScrollY(window.scrollY)
        setScrollX(window.scrollX)
    }

    return {
        scrollY,
        scrollX
    }

}

export default useScrollPosition