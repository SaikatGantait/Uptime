"use client";
import { API_BACKEND_URL } from "@/config";
import axios from "axios";
import { useEffect, useState } from "react";

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

    async function refreshWebsites() {    
        let headers: Record<string, string> = {};
        if (typeof window !== 'undefined' && (window as any).Clerk?.session?.getToken) {
            try {
                const token = await (window as any).Clerk.session.getToken();
                if (token) headers.Authorization = token as string;
            } catch {}
        }
        const response = await axios.get(`${API_BACKEND_URL}/api/v1/websites`, { headers });

        setWebsites(response.data.websites);
    }

    useEffect(() => {
        refreshWebsites();

        const interval = setInterval(() => {
            refreshWebsites();
        }, 1000 * 60 * 1);

        return () => clearInterval(interval);
    }, []);

    return { websites, refreshWebsites };

}