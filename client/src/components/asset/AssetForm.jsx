// ======================================================
// File Name : AssetForm.jsx
// Purpose   : Reusable UI component: AssetForm
// ======================================================

import { useEffect, useState } from 'react';
import { Input, Select } from '../ui/Input';
import { Button } from '../ui/Button';
import { useAssetClasses } from '../../hooks/useAssetClasses';
import { useFormOptions } from '../../hooks/useFormOptions';

// ======================================================
// START: Component Functions
// ======================================================

/** Add/edit form for a single asset. Used by the Assets/AssetForm page. */
// ======================================================
// Function : AssetForm
// Purpose  : React component that renders the 'AssetForm' UI
// ======================================================

export function AssetForm({ initial, onSubmit, submitLabel = 'Save Asset' }) {
    const [description, setDescription] = useState(initial?.description ?? '');
    const assetClassNames = useAssetClasses();
    const [assetClass, setAssetClass] = useState(initial?.assetClass ?? '');
    useEffect(() => {
        if (!assetClass && assetClassNames.length) setAssetClass(assetClassNames[0]);
    }, [assetClassNames, assetClass]);
    const [company, setCompany] = useState(initial?.company ?? '');
    const [cost, setCost] = useState(String(initial?.cost ?? ''));
    // Method choices come from the database (form_option_lists, list 'assetMethod').
    const { lists } = useFormOptions();
    const methods = lists.assetMethod ?? [];
    const [method, setMethod] = useState(initial?.method ?? '');
    useEffect(() => {
        if (!method && methods.length) setMethod(methods[0]);
    }, [methods, method]);
    function handleSubmit() {
        onSubmit({
            ...initial,
            description,
            assetClass,
            company,
            cost: Number(cost.replace(/,/g, '')) || 0,
            method
        });
    }
    return (<div className="card card-pad">
      <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. CNC Machine #4"/>
      <div className="form-grid">
        <Select label="Asset Class" value={assetClass} onChange={setAssetClass} options={assetClassNames} hint="Pick from Configuration → Asset Classes."/>
        <Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. 5B"/>
        <Input label="Cost" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0"/>
        <Select label="Depreciation Method" value={method} onChange={setMethod} options={methods}/>
      </div>
      <div className="flex gap-2 mt-2">
        <Button variant="primary" onClick={handleSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>);
}

// ======================================================
// END: AssetForm
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : AssetForm.jsx
// ======================================================
