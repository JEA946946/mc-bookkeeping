import React, { useState, useRef, useCallback } from 'react';
import { Autocomplete, TextField, Box, Typography, CircularProgress } from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import api from '../services/api';

export interface PlaceResult {
  name: string;
  address: string;
  phone: string;
  website: string;
  city: string;
  country: string;
  postal_code: string;
  state: string;
}

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: PlaceResult) => void;
  label?: string;
  size?: 'small' | 'medium';
  region?: string;
  sx?: Record<string, unknown>;
}

const PlacesAutocomplete: React.FC<PlacesAutocompleteProps> = ({
  value, onChange, onPlaceSelect, label = 'Company Name', size = 'small', region = 'ma', sx,
}) => {
  const [options, setOptions] = useState<Array<{ place_id: string; description: string }>>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchPlaces = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) { setOptions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params: Record<string, string> = { q: query };
        if (region) params.region = region;
        const res = await api.get('/places/autocomplete', { params });
        if (res.data.success) setOptions(res.data.data.predictions || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 300);
  }, [region]);

  const selectPlace = async (placeId: string) => {
    try {
      const res = await api.get('/places/details', { params: { place_id: placeId } });
      if (res.data.success) onPlaceSelect(res.data.data);
    } catch { /* ignore */ }
  };

  return (
    <Autocomplete
      freeSolo
      sx={sx}
      options={options}
      getOptionLabel={(opt) => typeof opt === 'string' ? opt : opt.description}
      filterOptions={(x) => x}
      inputValue={value}
      onInputChange={(_e, val, reason) => {
        onChange(val);
        if (reason === 'input') searchPlaces(val);
      }}
      onChange={(_e, val) => {
        if (val && typeof val !== 'string' && val.place_id) {
          selectPlace(val.place_id);
        }
      }}
      loading={loading}
      size={size}
      renderInput={(params) => (
        <TextField
          {...params}
          fullWidth
          label={label}
          size={size}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={typeof option === 'string' ? option : option.place_id}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SearchIcon sx={{ color: 'text.secondary', fontSize: 16 }} />
            <Typography variant="body2">{typeof option === 'string' ? option : option.description}</Typography>
          </Box>
        </li>
      )}
    />
  );
};

export default PlacesAutocomplete;
