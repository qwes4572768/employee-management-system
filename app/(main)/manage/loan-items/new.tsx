import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { useSession } from '@/providers/SessionProvider';
import { createLoanItemForActor } from '@/services/loanItemService';

export default function NewLoanItemScreen() {
  const router = useRouter();
  const { actor, authorizedSites, currentSite } = useSession();
  const [siteId, setSiteId] = useState(currentSite?.id ?? authorizedSites[0]?.id ?? '');
  const [itemCode, setItemCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [totalQuantity, setTotalQuantity] = useState('1');
  const [storageLocation, setStorageLocation] = useState('');
  const [requiresDeposit, setRequiresDeposit] = useState('0');
  const [depositAmount, setDepositAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect label="案場" value={siteId} options={authorizedSites.map((site) => ({ value: site.id, label: site.name }))} onChange={setSiteId} />
      <QinInput label="物品代碼" value={itemCode} onChangeText={setItemCode} placeholder="例如：CART-01" />
      <QinInput label="名稱" value={name} onChangeText={setName} placeholder="例如：推車" />
      <QinInput label="分類" value={category} onChangeText={setCategory} />
      <QinInput label="總數量" value={totalQuantity} onChangeText={setTotalQuantity} keyboardType="number-pad" />
      <QinInput label="存放位置" value={storageLocation} onChangeText={setStorageLocation} />
      <QinSelect
        label="原則是否需押金"
        value={requiresDeposit}
        options={[
          { value: '0', label: '不需押金' },
          { value: '1', label: '原則需押金（本階段不收款）' },
        ]}
        onChange={setRequiresDeposit}
      />
      <QinInput label="參考押金金額" value={depositAmount} onChangeText={setDepositAmount} keyboardType="decimal-pad" />
      <QinInput label="備註" value={notes} onChangeText={setNotes} multiline />
      <QinButton
        label="建立物品"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void createLoanItemForActor(actor, {
            siteId,
            itemCode,
            name,
            category,
            totalQuantity: Number(totalQuantity),
            storageLocation,
            requiresDeposit: requiresDeposit === '1',
            depositReferenceAmount: depositAmount.trim() ? Number(depositAmount) : null,
            notes,
          })
            .then((item) => router.replace({ pathname: '/(main)/manage/loan-items/[id]', params: { id: item.id } }))
            .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
