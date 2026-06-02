import React, { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Tabs, Tab, Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

const AccountingRules: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);

  const sectionTitle = (text: string) => (
    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{text}</Typography>
  );

  // ─── Tab 0: Overview ───────────────────────────────────────────────
  const renderOverview = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.marginSchemeTitle'))}
          <Typography variant="body2" sx={{ mb: 1 }}>{t('accountingRules.marginSchemeDesc')}</Typography>
          <Typography variant="body2" sx={{ mb: 1, fontFamily: 'monospace', bgcolor: 'grey.100', p: 1, borderRadius: 1 }}>
            {t('accountingRules.marginFormula')}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'grey.100', p: 1, borderRadius: 1 }}>
            {t('accountingRules.tvaFormula')}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.calcExampleTitle'))}
          <Typography variant="body2" sx={{ mb: 1 }}>{t('accountingRules.calcExampleIntro')}</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableBody>
                <TableRow><TableCell>{t('accountingRules.calcSalesPrice')}</TableCell><TableCell align="right">560.000 DH</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.calcPurchases')}</TableCell><TableCell align="right">426.000 DH</TableCell></TableRow>
                <TableRow><TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.calcMarginTTC')}</TableCell><TableCell align="right" sx={{ fontWeight: 600 }}>134.000 DH</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.calcMarginHT')}</TableCell><TableCell align="right">111.667 DH</TableCell></TableRow>
                <TableRow><TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.calcTVADue')}</TableCell><TableCell align="right" sx={{ fontWeight: 600 }}>22.333 DH</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.marginVsCommissionTitle'))}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.aspect')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.marginRegime')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.commissionRegime')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>{t('accountingRules.when')}</TableCell><TableCell>{t('accountingRules.whenMargin')}</TableCell><TableCell>{t('accountingRules.whenCommission')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.taxBase')}</TableCell><TableCell>{t('accountingRules.taxBaseMargin')}</TableCell><TableCell>{t('accountingRules.taxBaseCommission')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.tvaRate')}</TableCell><TableCell>20%</TableCell><TableCell>20%</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.inputTVADeduction')}</TableCell><TableCell>{t('common.no')}</TableCell><TableCell>{t('common.yes')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.tvaOnInvoice')}</TableCell><TableCell>{t('accountingRules.notShown')}</TableCell><TableCell>{t('accountingRules.shownSeparately')}</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Alert severity="warning">{t('accountingRules.warnTVAFullPayment')}</Alert>
      <Alert severity="warning">{t('accountingRules.warnNotExport')}</Alert>
    </Box>
  );

  // ─── Tab 1: TVA Rates & Tax Codes ─────────────────────────────────
  const renderTVARates = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.tvaRatesTitle'))}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.service')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">2024</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">2025</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">2026</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>{t('accountingRules.hotelAccommodation')}</TableCell><TableCell align="center">10%</TableCell><TableCell align="center">10%</TableCell><TableCell align="center">10%</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.restaurants')}</TableCell><TableCell align="center">10%</TableCell><TableCell align="center">10%</TableCell><TableCell align="center">10%</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.urbanTransport')}</TableCell><TableCell align="center">13%</TableCell><TableCell align="center">12%</TableCell><TableCell align="center">10%</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.nonUrbanTransport')}</TableCell><TableCell align="center">16%</TableCell><TableCell align="center">18%</TableCell><TableCell align="center">20%</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.tourOperatorMargin')}</TableCell><TableCell align="center">20%</TableCell><TableCell align="center">20%</TableCell><TableCell align="center">20%</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.commissionIntermediary')}</TableCell><TableCell align="center">20%</TableCell><TableCell align="center">20%</TableCell><TableCell align="center">20%</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.excursionsGuides')}</TableCell><TableCell align="center">20%</TableCell><TableCell align="center">20%</TableCell><TableCell align="center">20%</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.taxCodesTitle'))}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.code')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.name')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.rate')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.type')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.usage')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>TVA-MARGIN-20</TableCell><TableCell>{t('accountingRules.codeMargin20')}</TableCell><TableCell>20%</TableCell><TableCell>Sales</TableCell><TableCell>{t('accountingRules.codeMargin20Usage')}</TableCell></TableRow>
                <TableRow><TableCell>TVA-EX</TableCell><TableCell>{t('accountingRules.codeEx')}</TableCell><TableCell>0%</TableCell><TableCell>Purchase</TableCell><TableCell>{t('accountingRules.codeExUsage')}</TableCell></TableRow>
                <TableRow><TableCell>TVA-20</TableCell><TableCell>{t('accountingRules.code20')}</TableCell><TableCell>20%</TableCell><TableCell>Both</TableCell><TableCell>{t('accountingRules.code20Usage')}</TableCell></TableRow>
                <TableRow><TableCell>TVA-14</TableCell><TableCell>{t('accountingRules.code14')}</TableCell><TableCell>14%</TableCell><TableCell>Purchase</TableCell><TableCell>{t('accountingRules.code14Usage')}</TableCell></TableRow>
                <TableRow><TableCell>TVA-10</TableCell><TableCell>{t('accountingRules.code10')}</TableCell><TableCell>10%</TableCell><TableCell>Purchase</TableCell><TableCell>{t('accountingRules.code10Usage')}</TableCell></TableRow>
                <TableRow><TableCell>TVA-7</TableCell><TableCell>{t('accountingRules.code7')}</TableCell><TableCell>7%</TableCell><TableCell>Purchase</TableCell><TableCell>{t('accountingRules.code7Usage')}</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Alert severity="info">{t('accountingRules.infoSupplierTVA')}</Alert>
    </Box>
  );

  // ─── Tab 2: Deductions & Invoicing ─────────────────────────────────
  const renderDeductions = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.inputTVATitle'))}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 1 }}>{t('accountingRules.resoldServices')}</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>{t('accountingRules.resoldServicesDesc')}</Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 1 }}>{t('accountingRules.operatingExpenses')}</Typography>
          <Typography variant="body2" sx={{ mb: 0.5 }}>{t('accountingRules.operatingExpensesDesc')}</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            <li><Typography variant="body2">{t('accountingRules.deductFixedAssets')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.deductGeneral')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.deductProfessional')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.deductIT')}</Typography></li>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.invoicingRulesTitle'))}
          <Typography variant="body2" sx={{ mb: 1 }}>{t('accountingRules.invoicingRulesDesc')}</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            <li><Typography variant="body2">{t('accountingRules.invoiceReqName')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.invoiceReqTaxId')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.invoiceReqNumber')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.invoiceReqDate')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.invoiceReqDescription')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.invoiceReqTotal')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.invoiceReqTerms')}</Typography></li>
          </Box>
        </CardContent>
      </Card>

      <Alert severity="error">{t('accountingRules.errorInvoiceText')}</Alert>
    </Box>
  );

  // ─── Tab 3: IS & Corporate Tax ────────────────────────────────────
  const renderIS = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.isRatesTitle'))}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.taxableProfit')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.rate')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>{t('accountingRules.isUpTo100M')}</TableCell><TableCell>20%</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.isAbove100M')}</TableCell><TableCell>35%</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>{t('accountingRules.isProportional')}</Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.tourismExemptionTitle'))}
          <Typography variant="body2" sx={{ mb: 0.5 }}>{t('accountingRules.tourismExemptionDesc')}</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            <li><Typography variant="body2">{t('accountingRules.tourismExemption5yr')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.tourismExemptionAfter')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.tourismExemptionReq')}</Typography></li>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.acomptesTitle'))}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.installment')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.deadline')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>{t('accountingRules.acompte1')}</TableCell><TableCell>31. {t('accountingRules.march')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.acompte2')}</TableCell><TableCell>30. {t('accountingRules.june')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.acompte3')}</TableCell><TableCell>30. {t('accountingRules.september')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.acompte4')}</TableCell><TableCell>31. {t('accountingRules.december')}</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Alert severity="warning">{t('accountingRules.warnISFullAmount')}</Alert>
    </Box>
  );

  // ─── Tab 4: CNSS & Taxes ──────────────────────────────────────────
  const renderCNSS = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.cnssTitle'))}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.branch')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">{t('accountingRules.employee')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">{t('accountingRules.employer')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">{t('accountingRules.ceiling')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>{t('accountingRules.cnssPension')}</TableCell><TableCell align="center">4,48%</TableCell><TableCell align="center">8,98%</TableCell><TableCell align="center">6.000 DH/{t('accountingRules.month')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.cnssShortTerm')}</TableCell><TableCell align="center">0,33%</TableCell><TableCell align="center">0,67%</TableCell><TableCell align="center">6.000 DH/{t('accountingRules.month')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.cnssAMO')}</TableCell><TableCell align="center">2,26%</TableCell><TableCell align="center">2,26%</TableCell><TableCell align="center">{t('accountingRules.noCeiling')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.cnssAMOSolidarite')}</TableCell><TableCell align="center">--</TableCell><TableCell align="center">1,85%</TableCell><TableCell align="center">{t('accountingRules.noCeiling')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.cnssFamilyAllowance')}</TableCell><TableCell align="center">--</TableCell><TableCell align="center">6,40%</TableCell><TableCell align="center">{t('accountingRules.noCeiling')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.cnssTraining')}</TableCell><TableCell align="center">--</TableCell><TableCell align="center">1,60%</TableCell><TableCell align="center">{t('accountingRules.noCeiling')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.cnssIPE')}</TableCell><TableCell align="center">0,19%</TableCell><TableCell align="center">0,38%</TableCell><TableCell align="center">6.000 DH/{t('accountingRules.month')}</TableCell></TableRow>
                <TableRow sx={{ bgcolor: 'grey.50' }}><TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.cnssTotal')}</TableCell><TableCell align="center" sx={{ fontWeight: 600 }}>~6,74%</TableCell><TableCell align="center" sx={{ fontWeight: 600 }}>~21-25%</TableCell><TableCell align="center">--</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.taxeProfTitle'))}
          <Typography variant="body2" sx={{ mb: 1 }}>{t('accountingRules.taxeProfDesc')}</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'grey.100', p: 1, borderRadius: 1 }}>
            {t('accountingRules.taxeProfFormula')}
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
            <li><Typography variant="body2">{t('accountingRules.taxeProfRented')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.taxeProfOwned')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.taxeProfMin')}</Typography></li>
            <li><Typography variant="body2">{t('accountingRules.taxeProfExemption')}</Typography></li>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.cotisationMinTitle'))}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableBody>
                <TableRow><TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.rate')}</TableCell><TableCell>{t('accountingRules.cmRate')}</TableCell></TableRow>
                <TableRow><TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.cmMinimum')}</TableCell><TableCell>{t('accountingRules.cmMinAmount')}</TableCell></TableRow>
                <TableRow><TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.cmLoss')}</TableCell><TableCell>{t('common.yes')}</TableCell></TableRow>
                <TableRow><TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.cmOffset')}</TableCell><TableCell>{t('accountingRules.cmOffsetDesc')}</TableCell></TableRow>
                <TableRow><TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.cmNewBusiness')}</TableCell><TableCell>{t('accountingRules.cmNewBusinessDesc')}</TableCell></TableRow>
                <TableRow><TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.cmBasis')}</TableCell><TableCell>{t('accountingRules.cmBasisDesc')}</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );

  // ─── Tab 5: Deadlines & Penalties ─────────────────────────────────
  const renderDeadlines = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.monthlyDeadlinesTitle'))}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.deadline')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.obligation')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>{t('accountingRules.endOfMonth')}</TableCell><TableCell>{t('accountingRules.monthlyTVA')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.endOfMonth')}</TableCell><TableCell>{t('accountingRules.monthlyIR')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.endOfMonth')}</TableCell><TableCell>{t('accountingRules.monthlyCNSS')}</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.annualDeadlinesTitle'))}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.obligation')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>31. {t('accountingRules.january')}</TableCell><TableCell>{t('accountingRules.annualJan31')}</TableCell></TableRow>
                <TableRow><TableCell>28. {t('accountingRules.february')}</TableCell><TableCell>{t('accountingRules.annualFeb28')}</TableCell></TableRow>
                <TableRow><TableCell>1. {t('accountingRules.march')}</TableCell><TableCell>{t('accountingRules.annualMar1')}</TableCell></TableRow>
                <TableRow><TableCell>31. {t('accountingRules.march')}</TableCell><TableCell>{t('accountingRules.annualMar31')}</TableCell></TableRow>
                <TableRow><TableCell>30. {t('accountingRules.april')}</TableCell><TableCell>{t('accountingRules.annualApr30')}</TableCell></TableRow>
                <TableRow><TableCell>30. {t('accountingRules.june')}</TableCell><TableCell>{t('accountingRules.annualJun30')}</TableCell></TableRow>
                <TableRow><TableCell>31. {t('accountingRules.july')}</TableCell><TableCell>{t('accountingRules.annualJul31')}</TableCell></TableRow>
                <TableRow><TableCell>30. {t('accountingRules.september')}</TableCell><TableCell>{t('accountingRules.annualSep30')}</TableCell></TableRow>
                <TableRow><TableCell>31. {t('accountingRules.october')}</TableCell><TableCell>{t('accountingRules.annualOct31')}</TableCell></TableRow>
                <TableRow><TableCell>31. {t('accountingRules.december')}</TableCell><TableCell>{t('accountingRules.annualDec31')}</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {sectionTitle(t('accountingRules.penaltiesTitle'))}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 1 }}>{t('accountingRules.lateFilingTitle')}</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.situation')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.penalty')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>{t('accountingRules.filing30Days')}</TableCell><TableCell>{t('accountingRules.filing30DaysPenalty')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.filingOver30Days')}</TableCell><TableCell>{t('accountingRules.filingOver30DaysPenalty')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.taxationDOffice')}</TableCell><TableCell>{t('accountingRules.taxationDOfficePenalty')}</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 1 }}>{t('accountingRules.latePaymentTitle')}</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.situation')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accountingRules.penalty')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>{t('accountingRules.payment30Days')}</TableCell><TableCell>{t('accountingRules.payment30DaysPenalty')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.paymentOver30Days')}</TableCell><TableCell>{t('accountingRules.paymentOver30DaysPenalty')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.firstMonth')}</TableCell><TableCell>{t('accountingRules.firstMonthPenalty')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.subsequentMonths')}</TableCell><TableCell>{t('accountingRules.subsequentMonthsPenalty')}</TableCell></TableRow>
                <TableRow><TableCell>{t('accountingRules.failedTVAWithholding')}</TableCell><TableCell>{t('accountingRules.failedTVAWithholdingPenalty')}</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>{t('accountingRules.title')}</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab label={t('accountingRules.tabOverview')} />
        <Tab label={t('accountingRules.tabTVARates')} />
        <Tab label={t('accountingRules.tabDeductions')} />
        <Tab label={t('accountingRules.tabIS')} />
        <Tab label={t('accountingRules.tabCNSS')} />
        <Tab label={t('accountingRules.tabDeadlines')} />
      </Tabs>

      {tab === 0 && renderOverview()}
      {tab === 1 && renderTVARates()}
      {tab === 2 && renderDeductions()}
      {tab === 3 && renderIS()}
      {tab === 4 && renderCNSS()}
      {tab === 5 && renderDeadlines()}
    </Box>
  );
};

export default AccountingRules;
