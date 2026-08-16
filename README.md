#### BeforeAll 
```
stripe login
```
webhook: 
```
stripe listen --forward-to localhost:8080/api/v1/payments/webhook
```
success: 
```
stripe payment_intents confirm pi_3U50fmQjxKZxjpsp10OQ6xZn --payment-method=pm_card_visa
```
fail: 
```
stripe payment_intents confirm pi_3U50eJQjxKZxjpsp0e2t4pCP --payment-method=pm_card_chargeDeclined
```
refund: 
```
stripe refunds create --payment-intent=pi_3U50fmQjxKZxjpsp10OQ6xZn
```
stripeVersion: 2026-07-29.dahlia
