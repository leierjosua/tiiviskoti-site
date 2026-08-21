-- Uudet sähköpostilajit: kuitti (lisätty aiemmin suoraan kantaan) ja tarjous.
-- 'receipt' oli jo tuotannossa, mutta ei migraatioissa — otetaan mukaan tähän
-- idempotentisti, jotta migraatiot ja kanta ovat taas samassa linjassa.
-- ALTER TYPE ... ADD VALUE ei voi ajaa transaktiolohkossa: aja rivit erikseen.

alter type tk.mail_kind add value if not exists 'receipt';
alter type tk.mail_kind add value if not exists 'offer';
