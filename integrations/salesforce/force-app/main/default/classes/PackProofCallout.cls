/**
 * PackProof API GET callouts through Named Credential PackProof_API.
 * The merchant secret is only the External Credential merge field; this class never stores a key.
 */
public with sharing class PackProofCallout {
  public static final String NAMED_CREDENTIAL = 'PackProof_API';
  public static final String AUTHORIZATION_MERGE_FIELD = 'Bearer {!$Credential.PackProof_API.api_key}';

  public class Response {
    @AuraEnabled
    public Integer status;
    @AuraEnabled
    public Object body;
  }

  public static Response retrieve(String path) {
    assertSafePath(path);
    HttpRequest request = new HttpRequest();
    request.setMethod('GET');
    request.setEndpoint('callout:' + NAMED_CREDENTIAL + path);
    request.setHeader('Accept', 'application/json');
    request.setHeader('Authorization', AUTHORIZATION_MERGE_FIELD);
    request.setTimeout(20000);
    HttpResponse http = new Http().send(request);
    Response response = new Response();
    response.status = http.getStatusCode();
    response.body = parseBody(http.getBody());
    return response;
  }

  public static void assertSafePath(String path) {
    if (String.isBlank(path) || path.length() > 500) {
      throw userError('PackProof path is not allowed.');
    }
    String decoded;
    try {
      decoded = EncodingUtil.urlDecode(path, 'UTF-8');
    } catch (Exception caught) {
      throw userError('PackProof path is not allowed.');
    }
    if (
      !path.startsWith('/v1/') ||
      decoded.contains('://') ||
      decoded.contains('..') ||
      decoded.contains('\\') ||
      decoded.contains('@') ||
      decoded.contains('\n') ||
      decoded.contains('\r')
    ) {
      throw userError('PackProof path is not allowed.');
    }
    Boolean allowed = isAllowedPackProofPath(path);
    if (!allowed) {
      throw userError('PackProof path is not allowed.');
    }
  }

  public static Boolean isAllowedPackProofPath(String path) {
    String pathOnly = path.contains('?') ? path.substring(0, path.indexOf('?')) : path;
    return pathOnly.equals('/v1/connect/sessions') ||
      pathOnly.startsWith('/v1/connect/sessions/') ||
      pathOnly.equals('/v1/transactions') ||
      (pathOnly.startsWith('/v1/transactions/') && pathOnly.endsWith('/proof')) ||
      pathOnly.startsWith('/v1/proofs/');
  }

  private static Object parseBody(String raw) {
    if (String.isBlank(raw)) {
      return null;
    }
    try {
      return JSON.deserializeUntyped(raw);
    } catch (Exception caught) {
      Map<String, Object> error = new Map<String, Object>{
        'code' => 'REQUEST_FAILED',
        'message' => 'PackProof returned a non-JSON response.'
      };
      return new Map<String, Object>{ 'error' => error };
    }
  }

  public static AuraHandledException userError(String message) {
    AuraHandledException error = new AuraHandledException(message);
    error.setMessage(message);
    return error;
  }
}
