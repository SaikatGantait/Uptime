export interface SignupIncomingMessage {
    ip: string;
    publicKey: string;
    signedMessage: string;
    callbackId: string;
}

export interface ValidateIncomingMessage {
    callbackId: string;
    signedMessage: string;
    status: 'Good' | 'Bad';
    latency: number;
    websiteId: string;
    validatorId: string;
    severity: 'P1' | 'P2' | 'P3';
    details?: string;
}

export interface SignupOutgoingMessage {
    validatorId: string;
    callbackId: string;
}

export interface ValidateOutgoingMessage {
    url: string,
    callbackId: string,
    websiteId: string;
    retries: number;
    checkType: 'HTTP' | 'MULTI_STEP' | 'KEYWORD' | 'DNS' | 'TLS';
    expectedKeyword?: string | null;
    dnsRecordType?: string | null;
    dnsExpectedValue?: string | null;
    tlsWarningDaysCsv?: string | null;
    multiStepConfig?: string | null;
}

export type IncomingMessage = {
    type: 'signup'
    data: SignupIncomingMessage
} | {
    type: 'validate'
    data: ValidateIncomingMessage
}

export type OutgoingMessage = {
    type: 'signup'
    data: SignupOutgoingMessage
} | {
    type: 'validate'
    data: ValidateOutgoingMessage
}
