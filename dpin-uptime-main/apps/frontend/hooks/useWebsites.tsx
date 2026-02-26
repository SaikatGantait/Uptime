"use client";
import { API_BACKEND_URL } from "@/config";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface Website {
    id: string;
    url: string;
    cooldownMinutes: number;
    retries: number;
    quorum: number;
    validatorsPerRound: number;
    escalationMinutes: number;
    statusPageSlug?: string | null;
    statusPagePublic?: boolean;
    statusPageTitle?: string;
    checkType: "HTTP" | "MULTI_STEP" | "KEYWORD" | "DNS" | "TLS";
    expectedKeyword?: string | null;
    dnsRecordType?: string | null;
    dnsExpectedValue?: string | null;
    tlsWarningDaysCsv: string;
    multiStepConfig?: string | null;
    sloTarget: number;
    errorBudgetWindowMinutes: number;
    teamName: string;
    ticks: {
        id: string;
        createdAt: string;
        status: string;
        latency: number;
    }[];
    incidents: {
        id: string;
        status: "OPEN" | "RESOLVED";
        startedAt: string;
        resolvedAt?: string | null;
        acknowledgedAt?: string | null;
        escalatedAt?: string | null;
        summary?: string | null;
        events: {
            id: string;
            createdAt: string;
            type: string;
            message: string;
        }[];
    }[];
    alertRoutes: {
        id: string;
        targetTeam: string;
        minSeverity: "P1" | "P2" | "P3";
        channel: "WEBHOOK" | "SLACK" | "DISCORD" | "TEAMS" | "PAGERDUTY" | "OPSGENIE";
    }[];
    onCallSchedules: {
        id: string;
        rotationName: string;
        timezone: string;
        quietHoursStart?: number | null;
        quietHoursEnd?: number | null;
    }[];
    integrations: {
        id: string;
        type: "WEBHOOK" | "SLACK" | "DISCORD" | "TEAMS" | "PAGERDUTY" | "OPSGENIE";
        endpoint: string;
        enabled: boolean;
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