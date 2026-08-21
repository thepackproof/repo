/**
 * Lightning facade for Case Proof lookup. The LWC never receives the merchant API key.
 */
public with sharing class PackProofController {
  private static final String DEFAULT_ORDER_FIELD = 'PackProof_Order_Id__c';
  private static final String DEFAULT_FRAMEWORK = 'GENERIC';

  public class CaseContext {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String subject;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public String type;
    @AuraEnabled
    public String reason;
    @AuraEnabled
    public String orderFieldValue;
    @AuraEnabled
    public String receivingFramework;
  }

  @AuraEnabled(cacheable=true)
  public static CaseContext getCaseContext(Id recordId) {
    if (recordId == null) {
      throw PackProofCallout.userError('A Case record is required.');
    }
    if (recordId.getSobjectType() != Case.SObjectType) {
      throw PackProofCallout.userError('PackProof Proof is available on Case records.');
    }
    PackProof_Config__mdt config = PackProof_Config__mdt.getInstance('Default');
    String orderField = sanitizeOrderField(config == null ? DEFAULT_ORDER_FIELD : config.Order_Id_Field__c);
    String framework = config == null || String.isBlank(config.Receiving_Framework__c)
      ? DEFAULT_FRAMEWORK
      : config.Receiving_Framework__c.trim().toUpperCase();

    Case row = queryCase(recordId, orderField);
    CaseContext context = new CaseContext();
    context.id = row.Id;
    context.subject = row.Subject;
    context.description = row.Description;
    context.type = row.Type;
    context.reason = row.Reason;
    context.receivingFramework = framework;
    Object orderValue = orderField == null ? null : row.get(orderField);
    context.orderFieldValue = orderValue == null ? null : String.valueOf(orderValue);
    return context;
  }

  @AuraEnabled
  public static PackProofCallout.Response retrieve(String path) {
    return PackProofCallout.retrieve(path);
  }

  @AuraEnabled
  public static void addInternalNote(Id caseId, String body) {
    if (caseId == null || String.isBlank(body)) {
      throw PackProofCallout.userError('A Case and Proof note are required.');
    }
    if (caseId.getSobjectType() != Case.SObjectType) {
      throw PackProofCallout.userError('Internal notes can only be added to a Case.');
    }
    assertCaseVisible(caseId);
    String clipped = body.length() > 9900 ? body.substring(0, 9900) + '\n… [truncated]' : body;
    try {
      insert as user new FeedItem(
        ParentId = caseId,
        Body = clipped,
        Type = 'TextPost',
        Visibility = 'InternalUsers'
      );
    } catch (Exception caught) {
      String commentBody = clipped.length() > 4000 ? clipped.substring(0, 3990) + '\n…' : clipped;
      insert as user new CaseComment(
        ParentId = caseId,
        CommentBody = commentBody,
        IsPublished = false
      );
    }
  }

  private static Case queryCase(Id recordId, String orderField) {
    String soql =
      'SELECT Id, Subject, Description, Type, Reason' +
      (orderField == null ? '' : ', ' + orderField) +
      ' FROM Case WHERE Id = :recordId WITH USER_MODE LIMIT 1';
    List<Case> rows;
    try {
      rows = Database.query(soql);
    } catch (QueryException caught) {
      rows = [
        SELECT Id, Subject, Description, Type, Reason
        FROM Case
        WHERE Id = :recordId
        WITH USER_MODE
        LIMIT 1
      ];
    }
    if (rows.isEmpty()) {
      throw PackProofCallout.userError('Case was not found or is not accessible.');
    }
    return rows[0];
  }

  private static void assertCaseVisible(Id caseId) {
    List<Case> rows = [
      SELECT Id
      FROM Case
      WHERE Id = :caseId
      WITH USER_MODE
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      throw PackProofCallout.userError('Case was not found or is not accessible.');
    }
  }

  private static String sanitizeOrderField(String raw) {
    String fieldName = String.isBlank(raw) ? DEFAULT_ORDER_FIELD : raw.trim();
    if (!Pattern.matches('^[A-Za-z][A-Za-z0-9_]{0,39}$', fieldName)) {
      return null;
    }
    Map<String, Schema.SObjectField> fields = Schema.SObjectType.Case.fields.getMap();
    if (!fields.containsKey(fieldName)) {
      return null;
    }
    return fields.get(fieldName).getDescribe().getName();
  }
}
