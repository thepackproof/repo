@IsTest
private class PackProofControllerTest {
  @IsTest
  static void getCaseContext_readsOrderFieldAndDoesNotTreatEmailAsAuthority() {
    Case dispute = new Case(
      Subject = 'Item not received Order: order-123',
      Description = 'Customer reports INR',
      Origin = 'Phone',
      PackProof_Order_Id__c = 'order-123'
    );
    insert dispute;

    Test.startTest();
    PackProofController.CaseContext context = PackProofController.getCaseContext(dispute.Id);
    Test.stopTest();

    System.assertEquals(dispute.Id, context.id);
    System.assertEquals('order-123', context.orderFieldValue);
    System.assertEquals('Item not received Order: order-123', context.subject);
    System.assertNotEquals(null, context.receivingFramework);
  }

  @IsTest
  static void addInternalNote_writesInternalCaseFeed() {
    Case dispute = new Case(Subject = 'PackProof review', Origin = 'Phone');
    insert dispute;

    Test.startTest();
    PackProofController.addInternalNote(
      dispute.Id,
      'PackProof Proof PP-0123-ABCD-EFGH\nPackProof does not determine fraud, fault, or liability.'
    );
    Test.stopTest();

    List<FeedItem> feed = [
      SELECT Body, Visibility
      FROM FeedItem
      WHERE ParentId = :dispute.Id
    ];
    if (!feed.isEmpty()) {
      System.assert(feed[0].Body.contains('PP-0123-ABCD-EFGH'));
      System.assertEquals('InternalUsers', String.valueOf(feed[0].Visibility));
      System.assert(!feed[0].Body.contains('should refund'));
    } else {
      List<CaseComment> comments = [
        SELECT CommentBody, IsPublished
        FROM CaseComment
        WHERE ParentId = :dispute.Id
      ];
      System.assertEquals(1, comments.size());
      System.assertEquals(false, comments[0].IsPublished);
      System.assert(comments[0].CommentBody.contains('PP-0123-ABCD-EFGH'));
    }
  }

  @IsTest
  static void retrieve_isExposedForLightningWithoutInliningAKey() {
    Test.setMock(HttpCalloutMock.class, new ConnectMock());
    PackProofCallout.Response response = PackProofController.retrieve(
      '/v1/connect/sessions?externalOrderId=order-123'
    );
    System.assertEquals(200, response.status);
  }

  private class ConnectMock implements HttpCalloutMock {
    public HTTPResponse respond(HTTPRequest request) {
      System.assert(request.getEndpoint().startsWith('callout:PackProof_API'));
      System.assertEquals(PackProofCallout.AUTHORIZATION_MERGE_FIELD, request.getHeader('Authorization'));
      HttpResponse response = new HttpResponse();
      response.setStatusCode(200);
      response.setBody('{"data":[]}');
      return response;
    }
  }
}
