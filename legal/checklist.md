# Compliance checklist

Not legal advice: a working list of what the app needs, and when.

## Done
- Privacy policy names the provider (Ryan Foo) and contact (ryanfoo95@gmail.com).
- Web3Forms agreement checked and recorded (`web3forms-dpa.md`); privacy
  policy lists its current sub-processors.
- Squad and match data stays on each coach's device; the app doesn't send it to us.
- Beta sign-up page (co-coach.uk/beta): news emails need a separate,
  unticked box; each sign-up email records the choices, time and policy version.
- Usage counts are opt-in (off by default), use GoatCounter (EU, no cookies,
  no stored IPs) and never include names or anything typed.

## Before inviting the first coach other than you (beta)
- Pay the ICO data protection fee. From then on you hold other people's
  personal data (feedback and diagnostic reports, and the IP addresses
  Web3Forms sees), which isn't covered by the personal/household exemption.
  Check with the ICO fee checker: https://ico.org.uk/fee-checker
  Then add the registration number to the privacy policy.
- Save the full Web3Forms agreement as a PDF in this folder.
- Create the GoatCounter account with site code `cocoach`
  (https://www.goatcounter.com/signup), so counts arrive at
  cocoach.goatcounter.com. If that code is taken, change STATS_ENDPOINT in
  index.html. Until then, coaches who opt in send nothing that's kept.
- Keep the sign-up list (name, email, news yes/no, date) in one private
  sheet. Delete beta-only sign-ups 6 months after the beta ends.
- Send news emails only to people marked "news: yes", with an unsubscribe
  line in every email.

## Before public launch
- Short terms of use (no warranty, fair use, it's the coach's job to get
  parents' permission).
- A lawyer's review of the privacy policy and terms, focused on children's
  data and the ICO Children's Code, the "levels" feature, and transfers to
  Web3Forms in India.

## Before charging money, or storing coaches' data in the cloud
- Register with HMRC for Self Assessment once trading income goes over the
  £1,000 trading allowance in a tax year (or set up a limited company).
- Cloud storage makes us the coaches' processor: needs a processor
  agreement, security review and privacy policy update first.
