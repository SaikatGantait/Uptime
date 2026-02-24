"use client";
import { API_BACKEND_URL } from "@/config";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface Website {
    id: string;
    url: string;
    ticks: {
        id: string;
        createdAt: string;
        status: string;
        latency: number;
    }[];
}

export function useWebsites() {
    const [websites, setWebsites] = useState<Website[]>([]);
    const { getToken, isLoaded } = useAuth();

    const refreshWebsites = useCallback(async () => {
        const token = await getToken();
        const headers = token ? { Authorization: token } : {};
        const response = await axios.get(`${API_BACKEND_URL}/api/v1/websites`, { headers });

        setWebsites(response.data.websites);
    }, [getToken]);

    useEffect(() => {
        if (!isLoaded) {
            return;
        }

        refreshWebsites();

        const interval = setInterval(() => {
            refreshWebsites();
        }, 1000 * 60 * 1);

        return () => clearInterval(interval);
    }, [isLoaded, refreshWebsites]);

    return { websites, refreshWebsites };

}