// ======================================================
// File Name : AssetForm.jsx
// Purpose   : Page-level component for AssetForm
// ======================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { AssetForm as AssetFormFields } from '../../components/asset/AssetForm';
import { assetsApi } from '../../api/assets.api';

// ======================================================
// START: Page Component
// ======================================================

/** "Add Asset" page — wraps the shared AssetForm component. */
// ======================================================
// Function : AssetForm
// Purpose  : React component that renders the 'AssetForm' UI
// ======================================================

export function AssetForm() {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    async function handleSubmit(partial) {
        setSaving(true);
        try {
            const created = await assetsApi.create(partial);
            navigate(`/assets/${created.assetNumber ?? ''}`);
        }
        finally {
            setSaving(false);
        }
    }
    return (<AppLayout active="assets" title="Add Asset" crumb="Home / Asset Register / Add Asset">
      <div className="page-header">
        <div>
          <h1>Add Asset</h1>
          <p>Capitalize a new asset into the register</p>
        </div>
        <Button variant="ghost" to="/assets">
          ← Back to Register
        </Button>
      </div>

      <AssetFormFields onSubmit={handleSubmit} submitLabel={saving ? 'Saving…' : 'Save Asset'}/>
    </AppLayout>);
}

// ======================================================
// END: AssetForm
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : AssetForm.jsx
// ======================================================
