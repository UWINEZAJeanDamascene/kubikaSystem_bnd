# Sandbox to Production Quick Reference

## Table of Contents

- [Section 1: What You Need Before Starting](#section-1-what-you-need-before-starting)
- [Section 2: Step-by-Step Transition](#section-2-step-by-step-transition)
- [Section 3: If Something Goes Wrong](#section-3-if-something-goes-wrong)
- [Section 4: Post Go-Live Monitoring](#section-4-post-go-live-monitoring)

## Section 1: What You Need Before Starting

Have all items below ready before starting the switch.

- RRA production certificate document.
- Production VSDC WAR file provided by RRA. This is separate from the sandbox WAR.
- Production TIN and branch details confirmed in RRA's production system.
- Confirmed MongoDB backup from immediately before the switch.
- Access to the application server environment variables.
- Access to the Tomcat server where VSDC is deployed.
- Tenant administrator login for device initialization.

## Section 2: Step-by-Step Transition

1. Take the system offline or put it in maintenance mode. No invoices, POS sales, credit notes, GRNs, purchases, or stock movements should be created during the switch.

2. Back up the current MongoDB database completely.

   ```bash
   mongodump --uri="mongodb://localhost:27017/stock-management" --out=/backups/stock-management-before-production
   ```

3. Stop the test VSDC on Tomcat.

   Ubuntu or Linux:

   ```bash
   sudo systemctl stop tomcat9
   ```

   Windows Server:

   ```powershell
   net stop Tomcat9
   ```

4. Remove the test WAR file and expanded VSDC folder from Tomcat's `webapps` directory.

   Ubuntu or Linux:

   ```bash
   sudo rm -f /var/lib/tomcat9/webapps/vsdc.war
   sudo rm -rf /var/lib/tomcat9/webapps/vsdc
   ```

   Windows Server:

   ```powershell
   Remove-Item C:\Tomcat9\webapps\vsdc.war -Force
   Remove-Item C:\Tomcat9\webapps\vsdc -Recurse -Force
   ```

5. Deploy the production VSDC WAR file to Tomcat.

   Ubuntu or Linux:

   ```bash
   sudo cp /path/to/production-vsdc.war /var/lib/tomcat9/webapps/vsdc.war
   ```

   Windows Server:

   ```powershell
   copy C:\Path\To\production-vsdc.war C:\Tomcat9\webapps\vsdc.war
   ```

6. Start Tomcat.

   Ubuntu or Linux:

   ```bash
   sudo systemctl start tomcat9
   ```

   Windows Server:

   ```powershell
   net start Tomcat9
   ```

7. Verify VSDC is running by checking the Tomcat log.

   Ubuntu or Linux:

   ```bash
   sudo tail -n 100 /var/log/tomcat9/catalina.out
   ```

   Windows Server:

   ```powershell
   Get-Content C:\Tomcat9\logs\catalina*.log -Tail 100
   ```

8. Verify the VSDC URL responds.

   ```bash
   curl -I http://localhost:8080/vsdc/
   ```

9. Update the backend server environment variables.

   ```env
   EBM_MODE=production
   VSDC_BASE_URL=http://localhost:8080/vsdc
   RRA_PRODUCTION_URL=https://api-ebm.rra.gov.rw
   ```

10. Confirm `VSDC_BASE_URL` points to the local Tomcat address. It is usually the same URL used in sandbox because both sandbox and production VSDC run locally.

11. Restart the application server.

12. Open Company Settings.

13. Open EBM Devices.

14. Confirm the existing device record does not show as initialized for production mode.

15. Click Initialize Device.

16. Enter the production TIN, branch ID, and device serial number.

17. Submit the initialization request. This registers the production VSDC device and downloads production cryptographic keys.

18. Verify initialization succeeded. The device status must show Initialized for production mode.

19. Trigger a full code data sync.

20. Go to Company Settings.

21. Open EBM Code Data.

22. Click Sync Now.

23. Wait for completion and verify code data is present.

24. Create one small test invoice.

25. Confirm the invoice.

26. Verify the invoice reaches `ebmStatus: submitted`.

27. Download the invoice PDF.

28. Verify the EBM certification block shows a real production RRA receipt number, receipt date, internal data, receipt signature, and QR code.

29. Check the EBM retry queue.

30. Confirm there are no pending, failed, or abandoned records from the production test.

31. Bring the system back online.

## Section 3: If Something Goes Wrong

If device initialization fails in production, do not keep retrying blindly.

1. Save the exact error message.

2. Confirm the production WAR file belongs to the tenant TIN.

3. Confirm `EBM_MODE=production`.

4. Confirm `VSDC_BASE_URL` points to the local production VSDC.

5. Contact RRA at `cis_sdc_certification@rra.gov.rw` with the error message.

6. Redeploy the test VSDC temporarily only if the business must return to sandbox testing.

If invoices fail with a non-retryable error after production initialization:

1. Check that the production WAR file is the correct version provided for the certified TIN.

2. Check that the company TIN in the system matches the RRA production TIN.

3. Check the branch ID on the warehouse used by the transaction.

4. Check the product EBM fields and product registration status.

If code data sync fails immediately after switching:

1. Confirm the server can reach RRA production.

   ```bash
   curl -I https://api-ebm.rra.gov.rw
   ```

2. Confirm Tomcat is running.

   ```bash
   curl -I http://localhost:8080/vsdc/
   ```

3. Retry the code sync after fixing network or VSDC startup issues.

## Section 4: Post Go-Live Monitoring

For the first week after going live, run these checks every business day.

1. Open the EBM retry queue.

2. Investigate any failed or abandoned submission immediately.

3. Confirm no invoice stays in `pending` for more than 10 minutes.

4. Confirm the daily code sync job is completing successfully.

5. Verify at least five invoices per day show `ebmStatus: submitted`.

6. Open a sample of submitted invoices and confirm real RRA receipt numbers are present.

7. Confirm POS receipts show RRA receipt numbers and QR codes after async EBM submission completes.

8. Confirm GRNs and direct purchases show submitted EBM status after stock reporting.

9. Review backend logs for repeated VSDC connection errors.

10. Escalate immediately if RRA certification data stops appearing on printed documents.
