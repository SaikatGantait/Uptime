"use client";
import { API_BACKEND_URL } from "@/config";
import axios from "axios";
import { useEffect, useState } from "react";

type ClerkWindow = Window & {
    Clerk?: {
        session?: {
            getToken?: () => Promise<string | null>;
        };
    };
};

async function getClerkAuthHeader(): Promise<Record<string, string>> {
    if (typeof window === "undefined") {
        return {};
    }

    const clerk = (window as ClerkWindow).Clerk;
    if (!clerk?.session?.getToken) {
        return {};
    }

    try {
        const token = await clerk.session.getToken();
        return token ? { Authorization: token } : {};
    } catch {
        return {};
    }
}

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
        const headers = await getClerkAuthHeader();
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