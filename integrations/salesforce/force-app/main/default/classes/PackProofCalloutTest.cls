@IsTest
private class PackProofCalloutTest {
  private class ScriptedMock implements HttpCalloutMock {
    Integer status;
    String body;
    String expectedPath;

    ScriptedMock(Integer status, String body, String expectedPath) {
      this.status = status;
      this.body = body;
      this.expectedPath = expectedPath;
    }

    public HTTPResponse respond(HTTPRequest request) {
      System.assertEquals('GET', request.getMethod());
      System.assert(
        request.getEndpoint().startsWith('callout:PackProof_API'),
        'Callouts must use the PackProof Named Credential'
      );
      System.assertEquals(
        PackProofCallout.AUTHORIZATION_MERGE_FIELD,
        request.getHeader('Authorization'),
        'Authorization must stay a Named Credential merge field'
      );
      System.assert(
        !request.getHeader('Authorization').contains('pp_live_') &&
          !request.getHeader('Authorization').contains('pp_sandbox_'),
        'Merchant keys must not appear on the request'
      );
      if (expectedPath != null) {
        System.assert(
          request.getEndpoint().endsWith(expectedPath),
          'Unexpected PackProof path'
        );
      }
      HttpResponse response = new HttpResponse();
      response.setStatusCode(status);
      response.setBody(body);
      response.setHeader('Content-Type', 'application/json');
      return response;
    }
  }

  @IsTest
  static void retrieve_usesNamedCredentialAndUnwrapsJson() {
    Test.setMock(
      HttpCalloutMock.class,
      new ScriptedMock(
        200,
        '{"data":{"object":"packproof_passport","identity":{"displayId":"PP-0123-ABCD-EFGH"}}}',
        '/v1/transactions/txn_merchantorder01/proof?framework=GENERIC&category=DEFAULT'
      )
    );
    Test.startTest();
    PackProofCallout.Response response = PackProofCallout.retrieve(
      '/v1/transactions/txn_merchantorder01/proof?framework=GENERIC&category=DEFAULT'
    );
    Test.stopTest();
    System.assertEquals(200, response.status);
    Map<String, Object> body = (Map<String, Object>) response.body;
    Map<String, Object> data = (Map<String, Object>) body.get('data');
    System.assertEquals('packproof_passport', data.get('object'));
  }

  @IsTest
  static void retrieve_returnsPassportNotReadyWithoutInventingProof() {
    Test.setMock(
      HttpCalloutMock.class,
      new ScriptedMock(
        409,
        '{"error":{"code":"PASSPORT_NOT_READY","message":"This transaction does not yet qualify for a Proof."}}',
        '/v1/transactions/txn_merchantorder01/proof?framework=GENERIC&category=DEFAULT'
      )
    );
    PackProofCallout.Response response = PackProofCallout.retrieve(
      '/v1/transactions/txn_merchantorder01/proof?framework=GENERIC&category=DEFAULT'
    );
    System.assertEquals(409, response.status);
    Map<String, Object> body = (Map<String, Object>) response.body;
    Map<String, Object> error = (Map<String, Object>) body.get('error');
    System.assertEquals('PASSPORT_NOT_READY', error.get('code'));
  }

  @IsTest
  static void assertSafePath_rejectsHostOverrideAndUnknownPrefixes() {
    Boolean rejected = false;
    try {
      PackProofCallout.assertSafePath('https://evil.example/v1/transactions');
    } catch (AuraHandledException caught) {
      rejected = true;
    }
    System.assert(rejected, 'Absolute URLs must be rejected');

    rejected = false;
    try {
      PackProofCallout.assertSafePath('/v1/transactions/txn_merchantorder01/evidence');
    } catch (AuraHandledException caught) {
      rejected = true;
    }
    System.assert(rejected, 'Evidence inventory paths must not be fetched through this surface');
  }
}
