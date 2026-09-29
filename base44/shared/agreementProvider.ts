// ============================================================================
// AGREEMENT PROVIDER ABSTRACTION
//
// Defines the interface for agreement/e-signature providers.
// NativeArrivAgreementProvider is the default. DocuSignAgreementProvider
// is architecturally stubbed for future activation without changing
// Customer 360 or the agreement data model.
// ============================================================================

export interface AgreementProvider {
  providerId: string;
  displayName: string;

  createAgreement(client: any, params: any): Promise<any>;
  prepareAgreement(client: any, agreementId: string, params?: any): Promise<any>;
  sendAgreement(client: any, agreementId: string, actor: string): Promise<any>;
  getAgreementStatus(client: any, agreementId: string): Promise<any>;
  voidAgreement(client: any, agreementId: string, reason: string, actor: string): Promise<any>;
  sendReminder(client: any, agreementId: string, recipientId: string): Promise<any>;
  getExecutedDocument(client: any, agreementId: string): Promise<any>;
  getAuditCertificate(client: any, agreementId: string): Promise<any>;
}

/**
 * Native Arriv Agreement Provider — the default provider.
 * All signing, document handling, and audit is done inside Arriv Estate Media.
 */
export const NativeArrivAgreementProvider: AgreementProvider = {
  providerId: 'NATIVE_ARRIV',
  displayName: 'Arriv Agreements (Native)',

  async createAgreement(client: any, params: any): Promise<any> {
    // Delegated to manageAgreements backend function
    throw new Error('Use manageAgreements function directly for native provider');
  },

  async prepareAgreement(client: any, agreementId: string): Promise<any> {
    throw new Error('Use manageAgreements function directly for native provider');
  },

  async sendAgreement(client: any, agreementId: string, actor: string): Promise<any> {
    throw new Error('Use manageAgreements function directly for native provider');
  },

  async getAgreementStatus(client: any, agreementId: string): Promise<any> {
    throw new Error('Use getAgreementStatus function directly for native provider');
  },

  async voidAgreement(client: any, agreementId: string, reason: string, actor: string): Promise<any> {
    throw new Error('Use manageAgreements function directly for native provider');
  },

  async sendReminder(client: any, agreementId: string, recipientId: string): Promise<any> {
    throw new Error('Use manageAgreements function directly for native provider');
  },

  async getExecutedDocument(client: any, agreementId: string): Promise<any> {
    throw new Error('Use manageAgreements function directly for native provider');
  },

  async getAuditCertificate(client: any, agreementId: string): Promise<any> {
    throw new Error('Use generateAgreementCompletionCertificate function directly for native provider');
  },
};

/**
 * DocuSign Agreement Provider — architecturally stubbed for future activation.
 * When activated, this will delegate to DocuSign APIs without changing
 * Customer 360 or the agreement data model.
 */
export const DocuSignAgreementProvider: AgreementProvider = {
  providerId: 'DOCUSIGN_FUTURE',
  displayName: 'DocuSign (Future)',

  async createAgreement(): Promise<any> {
    throw new Error('DocuSign provider not yet activated. Configure DOCUSIGN credentials and activate in settings.');
  },
  async prepareAgreement(): Promise<any> {
    throw new Error('DocuSign provider not yet activated.');
  },
  async sendAgreement(): Promise<any> {
    throw new Error('DocuSign provider not yet activated.');
  },
  async getAgreementStatus(): Promise<any> {
    throw new Error('DocuSign provider not yet activated.');
  },
  async voidAgreement(): Promise<any> {
    throw new Error('DocuSign provider not yet activated.');
  },
  async sendReminder(): Promise<any> {
    throw new Error('DocuSign provider not yet activated.');
  },
  async getExecutedDocument(): Promise<any> {
    throw new Error('DocuSign provider not yet activated.');
  },
  async getAuditCertificate(): Promise<any> {
    throw new Error('DocuSign provider not yet activated.');
  },
};

/**
 * Get the provider by ID. Returns the native provider by default.
 */
export function getAgreementProvider(providerId: string): AgreementProvider {
  switch (providerId) {
    case 'NATIVE_ARRIV':
      return NativeArrivAgreementProvider;
    case 'DOCUSIGN_FUTURE':
      return DocuSignAgreementProvider;
    default:
      return NativeArrivAgreementProvider;
  }
}